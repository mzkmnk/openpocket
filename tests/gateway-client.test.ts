import { afterEach, describe, expect, it, vi } from "vitest";

import type { GatewayWebSocketLike } from "../src/core/gateway";
import { GatewayClient } from "../src/core/gateway";

class MockWebSocket implements GatewayWebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer | ArrayBufferView }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;

  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emitEvent(event: string, payload?: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ type: "event", event, payload }) });
  }

  emitResponse(id: string, payload?: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ type: "res", id, ok: true, payload }) });
  }

  emitClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function parseLastReq(socket: MockWebSocket): { id: string; method: string; params?: unknown } {
  const raw = socket.sent[socket.sent.length - 1];
  const parsed = JSON.parse(raw) as { id: string; method: string; params?: unknown };
  return parsed;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GatewayClient", () => {
  it("connects with challenge handshake and supports request/response", async () => {
    const sockets: MockWebSocket[] = [];
    const logs: string[] = [];
    const client = new GatewayClient({
      createWebSocket: () => {
        const socket = new MockWebSocket();
        sockets.push(socket);
        return socket;
      },
      now: () => 100,
      randomId: () => "r1",
      onLog: (line) => logs.push(line),
    });

    const connectPromise = client.connect({
      gatewayUrl: "wss://gateway.example.ts.net/",
      buildConnectParams: () => ({ auth: { token: "secret" }, role: "operator" }),
    });

    const socket = sockets[0];
    socket.emitOpen();
    socket.emitEvent("connect.challenge", { nonce: "nonce-1" });
    await flushMicrotasks();

    const connectReq = parseLastReq(socket);
    expect(connectReq.method).toBe("connect");

    socket.emitResponse(connectReq.id, { protocol: 3 });

    await expect(connectPromise).resolves.toEqual({ protocol: 3 });
    expect(client.getStatus()).toBe("connected");

    const reqPromise = client.request<{ sessions: string[] }>("sessions.list", { limit: 10 });
    const req = parseLastReq(socket);
    expect(req.method).toBe("sessions.list");
    socket.emitResponse(req.id, { sessions: ["s1"] });

    await expect(reqPromise).resolves.toEqual({ sessions: ["s1"] });

    expect(logs.join("\n")).toContain("<redacted:6>");
    expect(logs.join("\n")).not.toContain("secret");
  });

  it("routes named events and wildcard events", async () => {
    const sockets: MockWebSocket[] = [];
    const client = new GatewayClient({
      createWebSocket: () => {
        const socket = new MockWebSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const onChat = vi.fn();
    const onAll = vi.fn();

    const stopChat = client.onEvent("chat", onChat);
    client.onEvent("*", onAll);

    const connectPromise = client.connect({
      gatewayUrl: "wss://gateway.example.ts.net/",
      buildConnectParams: () => ({}),
    });

    const socket = sockets[0];
    socket.emitOpen();
    socket.emitEvent("connect.challenge", { nonce: "nonce-1" });
    await flushMicrotasks();
    const connectReq = parseLastReq(socket);
    socket.emitResponse(connectReq.id, { ok: true });
    await connectPromise;

    socket.emitEvent("chat", { state: "delta" });
    expect(onChat).toHaveBeenCalledTimes(1);
    expect(onAll).toHaveBeenCalledTimes(2); // connect.challenge + chat

    stopChat();
    socket.emitEvent("chat", { state: "final" });

    expect(onChat).toHaveBeenCalledTimes(1);
    expect(onAll).toHaveBeenCalledTimes(3);
  });

  it("reconnects with backoff after unexpected close", async () => {
    vi.useFakeTimers();

    const sockets: MockWebSocket[] = [];
    const statuses: string[] = [];
    let connectBuildCount = 0;

    const client = new GatewayClient({
      createWebSocket: () => {
        const socket = new MockWebSocket();
        sockets.push(socket);
        return socket;
      },
      reconnect: {
        initialDelayMs: 1_000,
        maxDelayMs: 1_000,
      },
      onStatusChange: (status) => statuses.push(status),
    });

    const connectPromise = client.connect({
      gatewayUrl: "wss://gateway.example.ts.net/",
      buildConnectParams: () => {
        connectBuildCount += 1;
        return { role: "operator" };
      },
    });

    sockets[0].emitOpen();
    sockets[0].emitEvent("connect.challenge", { nonce: "n1" });
    await flushMicrotasks();
    const req = parseLastReq(sockets[0]);
    sockets[0].emitResponse(req.id, { protocol: 3 });

    await connectPromise;
    expect(client.getStatus()).toBe("connected");

    sockets[0].emitClose();

    expect(client.getStatus()).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(1_000);

    expect(sockets.length).toBe(2);

    sockets[1].emitOpen();
    sockets[1].emitEvent("connect.challenge", { nonce: "n2" });
    await flushMicrotasks();
    const reconnectReq = parseLastReq(sockets[1]);
    sockets[1].emitResponse(reconnectReq.id, { protocol: 3 });

    await vi.runAllTicks();

    expect(client.getStatus()).toBe("connected");
    expect(connectBuildCount).toBe(2);
    expect(statuses).toContain("reconnecting");
  });
});
