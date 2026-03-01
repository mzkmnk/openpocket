import { describe, expect, it } from "vitest";

import { ModelsService } from "../src/core/models/ModelsService";

type Call = {
  method: string;
  params?: unknown;
};

class MockRequester {
  calls: Call[] = [];
  listPayload: unknown = { models: [] };

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params });
    if (method === "models.list") {
      return this.listPayload as T;
    }
    throw new Error(`Unexpected method: ${method}`);
  }
}

describe("ModelsService", () => {
  // models.list を呼び出してモデル一覧を返すこと
  it("loads model catalog via models.list", async () => {
    const requester = new MockRequester();
    requester.listPayload = {
      models: [
        { id: "openai/gpt-5", name: "GPT-5", provider: "openai", contextWindow: 128000 },
        { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "anthropic" },
      ],
    };

    const service = new ModelsService(requester);
    const models = await service.listModels();

    expect(models).toHaveLength(2);
    expect(models[0]?.id).toBe("openai/gpt-5");
    expect(requester.calls[0]).toEqual({ method: "models.list", params: undefined });
  });

  // models.list の payload が不正な場合はエラーにすること
  it("throws when models.list payload is invalid", async () => {
    const requester = new MockRequester();
    requester.listPayload = { models: [{ id: "x", name: "X" }] };

    const service = new ModelsService(requester);

    await expect(service.listModels()).rejects.toThrow("Invalid models.list response payload");
  });
});
