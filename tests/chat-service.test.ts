import { describe, expect, it } from "vitest";

import type { GatewayEventPacket } from "../src/core/gateway/types";
import { ChatService } from "../src/core/chat/ChatService";

type Call = {
  method: string;
  params?: unknown;
};

class MockRequester {
  calls: Call[] = [];
  historyPayload: unknown = { sessionKey: "s1", messages: [] };
  sendPayload: unknown = { runId: "run-1", status: "started" };
  abortPayload: unknown = { ok: true, aborted: false, runIds: [] };

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params });
    if (method === "chat.history") {
      return this.historyPayload as T;
    }
    if (method === "chat.send") {
      return this.sendPayload as T;
    }
    if (method === "chat.abort") {
      return this.abortPayload as T;
    }
    throw new Error(`Unexpected method: ${method}`);
  }
}

type RawEventListener = (payload: unknown, packet: GatewayEventPacket) => void;

class MockEventSource {
  private readonly listeners = new Map<string, Set<RawEventListener>>();

  onEvent(event: string, listener: RawEventListener): () => void {
    const set = this.listeners.get(event) ?? new Set<RawEventListener>();
    set.add(listener);
    this.listeners.set(event, set);
    return () => {
      const existing = this.listeners.get(event);
      if (!existing) {
        return;
      }
      existing.delete(listener);
      if (existing.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit(event: string, payload?: unknown): void {
    const packet: GatewayEventPacket = { type: "event", event, payload };
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const listener of set.values()) {
      listener(payload, packet);
    }
  }
}

describe("ChatService", () => {
  // chat.history の payload を正規化して返すこと
  it("loads chat history via chat.history", async () => {
    const requester = new MockRequester();
    requester.historyPayload = {
      sessionKey: "session-alpha",
      sessionId: "sid-1",
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      thinkingLevel: "high",
      verboseLevel: "off",
    };
    const service = new ChatService(requester);

    const result = await service.getHistory({ sessionKey: "session-alpha", limit: 100 });

    expect(result.sessionKey).toBe("session-alpha");
    expect(result.messages).toHaveLength(1);
    expect(requester.calls[0]).toEqual({
      method: "chat.history",
      params: { sessionKey: "session-alpha", limit: 100 },
    });
  });

  // idempotencyKey 未指定時に自動生成して chat.send を呼ぶこと
  it("generates idempotency key when sending without explicit key", async () => {
    const requester = new MockRequester();
    requester.sendPayload = { runId: "session-alpha:1000:rid", status: "started" };
    const service = new ChatService(requester, {
      now: () => 1000,
      randomId: () => "rid",
    });

    const result = await service.send({
      sessionKey: "session-alpha",
      message: "hello",
    });

    expect(result).toEqual({ runId: "session-alpha:1000:rid", status: "started" });
    expect(requester.calls[0]).toEqual({
      method: "chat.send",
      params: {
        sessionKey: "session-alpha",
        message: "hello",
        thinking: undefined,
        deliver: undefined,
        attachments: undefined,
        timeoutMs: undefined,
        idempotencyKey: "session-alpha:1000:rid",
      },
    });
  });

  // idempotencyKey 指定時はその値で chat.send を呼ぶこと
  it("uses provided idempotency key when sending", async () => {
    const requester = new MockRequester();
    requester.sendPayload = { runId: "fixed-key", status: "in_flight" };
    const service = new ChatService(requester);

    const result = await service.send({
      sessionKey: "session-alpha",
      message: "hello",
      idempotencyKey: "fixed-key",
      timeoutMs: 30_000,
    });

    expect(result).toEqual({ runId: "fixed-key", status: "in_flight" });
    expect(requester.calls[0]).toEqual({
      method: "chat.send",
      params: {
        sessionKey: "session-alpha",
        message: "hello",
        thinking: undefined,
        deliver: undefined,
        attachments: undefined,
        timeoutMs: 30_000,
        idempotencyKey: "fixed-key",
      },
    });
  });

  // chat.abort を呼び出して abort 結果を返すこと
  it("aborts chat run via chat.abort", async () => {
    const requester = new MockRequester();
    requester.abortPayload = { ok: true, aborted: true, runIds: ["r1"] };
    const service = new ChatService(requester);

    const result = await service.abort({ sessionKey: "session-alpha", runId: "r1" });

    expect(result).toEqual({ ok: true, aborted: true, runIds: ["r1"] });
    expect(requester.calls[0]).toEqual({
      method: "chat.abort",
      params: { sessionKey: "session-alpha", runId: "r1" },
    });
  });

  // chat event の購読時に session/run フィルタを適用すること
  it("subscribes to chat events and applies filters", () => {
    const requester = new MockRequester();
    const events = new MockEventSource();
    const service = new ChatService(requester, { eventSource: events });
    const received: string[] = [];

    const off = service.onChatEvent(
      (payload) => {
        received.push(`${payload.sessionKey}:${payload.runId}:${payload.state}`);
      },
      { sessionKey: "s1", runId: "r1" },
    );

    events.emit("chat", { runId: "r1", sessionKey: "s1", seq: 1, state: "delta" });
    events.emit("chat", { runId: "r2", sessionKey: "s1", seq: 2, state: "delta" });
    events.emit("chat", { runId: "r1", sessionKey: "s2", seq: 3, state: "final" });
    events.emit("chat", { runId: "r1", sessionKey: "s1", seq: 4, state: "final" });
    off();
    events.emit("chat", { runId: "r1", sessionKey: "s1", seq: 5, state: "delta" });

    expect(received).toEqual(["s1:r1:delta", "s1:r1:final"]);
  });

  // chat event payload が不正な場合は無視すること
  it("ignores invalid chat event payloads", () => {
    const requester = new MockRequester();
    const events = new MockEventSource();
    const service = new ChatService(requester, { eventSource: events });
    const received: string[] = [];

    service.onChatEvent((payload) => {
      received.push(payload.runId);
    });

    events.emit("chat", { runId: "r1", sessionKey: "s1", state: "delta" });
    events.emit("chat", { runId: "r2", sessionKey: "s1", seq: 1, state: "delta" });

    expect(received).toEqual(["r2"]);
  });

  // eventSource 未設定時は chat event 購読を拒否すること
  it("throws when subscribing chat events without event source", () => {
    const requester = new MockRequester();
    const service = new ChatService(requester);

    expect(() => service.onChatEvent(() => undefined)).toThrow("Chat event source is not configured");
  });

  // chat.history payload が不正な場合はエラーにすること
  it("throws when chat.history payload is invalid", async () => {
    const requester = new MockRequester();
    requester.historyPayload = { invalid: true };
    const service = new ChatService(requester);

    await expect(service.getHistory({ sessionKey: "s1" })).rejects.toThrow(
      "Invalid chat.history response payload",
    );
  });
});

