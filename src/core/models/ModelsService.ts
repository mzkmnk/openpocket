import type { ModelChoice, ModelsListResult } from "./types";

type GatewayRequester = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isModelChoice(value: unknown): value is ModelChoice {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.provider === "string" &&
    value.provider.length > 0
  );
}

function toListResult(payload: unknown): ModelsListResult {
  if (!isRecord(payload) || !Array.isArray(payload.models) || !payload.models.every(isModelChoice)) {
    throw new Error("Invalid models.list response payload");
  }
  return payload as ModelsListResult;
}

/**
 * Provides app-side model catalog operations backed by Gateway methods.
 * Gateway メソッドを用いてアプリ側のモデルカタログ取得操作を提供します。
 */
export class ModelsService {
  private readonly requester: GatewayRequester;

  /**
   * Creates a models service using Gateway requester.
   * Gateway requester を使う models サービスを生成します。
   *
   * @param requester - Gateway requester (`GatewayClient` compatible).
   *                    Gateway リクエスタ（`GatewayClient` 互換）。
   */
  constructor(requester: GatewayRequester) {
    this.requester = requester;
  }

  /**
   * Loads available models from Gateway `models.list`.
   * Gateway `models.list` から利用可能モデルを取得します。
   *
   * @returns Normalized model list.
   *          正規化済みモデル一覧。
   */
  async listModels(): Promise<ModelChoice[]> {
    const payload = await this.requester.request("models.list");
    return toListResult(payload).models;
  }
}
