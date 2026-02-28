import { describe, expect, it } from "vitest";

import type { SecureStoreAdapter } from "../src/core/security/secureStore";
import { SessionsService } from "../src/core/sessions/SessionsService";

class MemoryStore implements SecureStoreAdapter {
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

type Call = {
  method: string;
  params?: unknown;
};

class MockRequester {
  calls: Call[] = [];
  listPayload: unknown = { sessions: [] };
  patchPayload: unknown = { ok: true, key: "s1" };

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params });
    if (method === "sessions.list") {
      return this.listPayload as T;
    }
    if (method === "sessions.patch") {
      return this.patchPayload as T;
    }
    throw new Error(`Unexpected method: ${method}`);
  }
}

describe("SessionsService", () => {
  // ピン優先かつ更新日時の降順で一覧を返すこと
  it("returns sessions with pinned-first and recent-first ordering", async () => {
    const requester = new MockRequester();
    requester.listPayload = {
      sessions: [
        { key: "a", label: "Alpha", updatedAt: "2026-03-01T00:00:00Z" },
        { key: "b", label: "Beta", updatedAt: "2026-02-28T23:00:00Z" },
        { key: "c", label: "Gamma", updatedAt: "2026-03-01T01:00:00Z" },
      ],
    };
    const store = new MemoryStore();
    const service = new SessionsService(requester, store);

    await service.setPinned("b", true);
    const sessions = await service.listSessions();

    expect(sessions.map((session) => session.key)).toEqual(["b", "c", "a"]);
    expect(sessions[0]?.pinned).toBe(true);
    expect(requester.calls[0]?.method).toBe("sessions.list");
    expect(requester.calls[0]?.params).toMatchObject({
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
  });

  // label と key の両方で大文字小文字を無視して検索できること
  it("filters sessions by key or label with case-insensitive matching", async () => {
    const requester = new MockRequester();
    requester.listPayload = {
      sessions: [
        { key: "session-alpha", label: "Project One", updatedAt: 1 },
        { key: "session-beta", label: "Beta Label", updatedAt: 2 },
      ],
    };
    const store = new MemoryStore();
    const service = new SessionsService(requester, store);

    const byKey = await service.listSessions({ search: "ALPHA" });
    const byLabel = await service.listSessions({ search: "beta label" });

    expect(byKey.map((session) => session.key)).toEqual(["session-alpha"]);
    expect(byLabel.map((session) => session.key)).toEqual(["session-beta"]);
  });

  // ピン状態のトグル結果が永続化されること
  it("toggles and persists pinned keys", async () => {
    const requester = new MockRequester();
    const store = new MemoryStore();
    const service = new SessionsService(requester, store);

    await expect(service.togglePinned("x")).resolves.toBe(true);
    await expect(service.getPinnedKeys()).resolves.toEqual(new Set(["x"]));

    await expect(service.togglePinned("x")).resolves.toBe(false);
    await expect(service.getPinnedKeys()).resolves.toEqual(new Set());
  });

  // ラベル更新時に sessions.patch を正規化パラメータで呼ぶこと
  it("calls sessions.patch with normalized label values", async () => {
    const requester = new MockRequester();
    const store = new MemoryStore();
    const service = new SessionsService(requester, store);

    await service.updateSessionLabel("s1", "  New Label  ");
    await service.updateSessionLabel("s1", "   ");

    expect(requester.calls[0]).toEqual({
      method: "sessions.patch",
      params: { key: "s1", label: "New Label" },
    });
    expect(requester.calls[1]).toEqual({
      method: "sessions.patch",
      params: { key: "s1", label: null },
    });
  });

  // sessions.list の payload が不正な場合はエラーにすること
  it("throws when sessions.list payload is invalid", async () => {
    const requester = new MockRequester();
    requester.listPayload = { invalid: true };
    const store = new MemoryStore();
    const service = new SessionsService(requester, store);

    await expect(service.listSessions()).rejects.toThrow("Invalid sessions.list response payload");
  });
});
