import { describe, expect, it } from "vitest";

import { AgentsService } from "../src/core/agents/AgentsService";

type Call = {
  method: string;
  params?: unknown;
};

class MockRequester {
  calls: Call[] = [];
  payload: unknown = {
    defaultId: "default",
    mainKey: "main",
    scope: "per-sender",
    agents: [{ id: "default", name: "Default" }],
  };

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params });
    if (method === "agents.list") {
      return this.payload as T;
    }
    throw new Error(`Unexpected method: ${method}`);
  }
}

describe("AgentsService", () => {
  // agents.list を呼び出して一覧を返すこと
  it("loads agents via agents.list", async () => {
    const requester = new MockRequester();
    const service = new AgentsService(requester);

    const result = await service.listAgents();

    expect(requester.calls[0]).toEqual({ method: "agents.list", params: {} });
    expect(result.defaultId).toBe("default");
    expect(result.mainKey).toBe("main");
    expect(result.agents[0]?.id).toBe("default");
  });

  // agents.list の payload が不正な場合はエラーにすること
  it("throws when agents.list payload is invalid", async () => {
    const requester = new MockRequester();
    requester.payload = { invalid: true };
    const service = new AgentsService(requester);

    await expect(service.listAgents()).rejects.toThrow("Invalid agents.list response payload");
  });
});
