import type { AgentsListParams, AgentsListResult } from "./types";

type GatewayRequester = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toListResult(payload: unknown): AgentsListResult {
  if (!isRecord(payload)) {
    throw new Error("Invalid agents.list response payload");
  }
  if (
    typeof payload.defaultId !== "string" ||
    typeof payload.mainKey !== "string" ||
    (payload.scope !== "per-sender" && payload.scope !== "global") ||
    !Array.isArray(payload.agents)
  ) {
    throw new Error("Invalid agents.list response payload");
  }
  return payload as AgentsListResult;
}

/**
 * Provides app-side agent catalog operations backed by Gateway methods.
 * Gateway メソッドを用いてアプリ側の agent カタログ操作を提供します。
 */
export class AgentsService {
  private readonly requester: GatewayRequester;

  /**
   * Creates an agent service using a Gateway requester.
   * Gateway requester を使う agent サービスを生成します。
   *
   * @param requester - Gateway requester (`GatewayClient` compatible).
   *                    Gateway リクエスタ（`GatewayClient` 互換）。
   */
  constructor(requester: GatewayRequester) {
    this.requester = requester;
  }

  /**
   * Loads agents available to the connected operator from Gateway.
   * 接続中 operator が利用可能な agent 一覧を Gateway から取得します。
   *
   * @param params - Optional `agents.list` request params.
   *                 `agents.list` リクエストパラメータ（任意）。
   * @returns Parsed `agents.list` response.
   *          解析済みの `agents.list` レスポンス。
   */
  async listAgents(params: AgentsListParams = {}): Promise<AgentsListResult> {
    const payload = await this.requester.request("agents.list", params);
    return toListResult(payload);
  }
}
