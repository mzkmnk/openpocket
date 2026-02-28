import type { GatewayEventPacket } from "../gateway/types";
import type {
  ChatAbortParams,
  ChatAbortResult,
  ChatEventListener,
  ChatEventPayload,
  ChatHistoryParams,
  ChatHistoryResult,
  ChatSendAck,
  ChatSendInput,
  ChatSendParams,
} from "./types";

type GatewayRequester = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

type GatewayEventSource = {
  onEvent(
    event: string,
    listener: (payload: unknown, packet: GatewayEventPacket) => void,
  ): () => void;
};

/**
 * Optional dependencies used by chat service.
 * chat サービスで使う任意依存です。
 */
export type ChatServiceOptions = {
  eventSource?: GatewayEventSource;
  now?: () => number;
  randomId?: () => string;
};

/**
 * Optional filters for chat stream subscription.
 * chat ストリーム購読の任意フィルタです。
 */
export type ChatEventFilter = {
  sessionKey?: string;
  runId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatState(value: unknown): value is ChatEventPayload["state"] {
  return value === "delta" || value === "final" || value === "aborted" || value === "error";
}

function parseHistoryResult(payload: unknown): ChatHistoryResult {
  if (
    !isRecord(payload) ||
    typeof payload.sessionKey !== "string" ||
    !Array.isArray(payload.messages)
  ) {
    throw new Error("Invalid chat.history response payload");
  }
  return payload as ChatHistoryResult;
}

function parseSendAck(payload: unknown): ChatSendAck {
  if (
    !isRecord(payload) ||
    typeof payload.runId !== "string" ||
    typeof payload.status !== "string"
  ) {
    throw new Error("Invalid chat.send response payload");
  }
  if (payload.status === "error") {
    if (typeof payload.summary !== "string") {
      throw new Error("Invalid chat.send response payload");
    }
    return {
      runId: payload.runId,
      status: "error",
      summary: payload.summary,
    };
  }
  if (payload.status === "started" || payload.status === "in_flight" || payload.status === "ok") {
    return {
      runId: payload.runId,
      status: payload.status,
    };
  }
  throw new Error("Invalid chat.send response payload");
}

function parseAbortResult(payload: unknown): ChatAbortResult {
  if (!isRecord(payload) || payload.ok !== true || typeof payload.aborted !== "boolean") {
    throw new Error("Invalid chat.abort response payload");
  }
  if (!Array.isArray(payload.runIds) || payload.runIds.some((value) => typeof value !== "string")) {
    throw new Error("Invalid chat.abort response payload");
  }
  return payload as ChatAbortResult;
}

function parseChatEventPayload(payload: unknown): ChatEventPayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  if (
    typeof payload.runId !== "string" ||
    typeof payload.sessionKey !== "string" ||
    typeof payload.seq !== "number" ||
    !Number.isFinite(payload.seq) ||
    !isChatState(payload.state)
  ) {
    return null;
  }
  return payload as ChatEventPayload;
}

/**
 * Provides app-side chat operations backed by Gateway methods.
 * Gateway メソッドを用いてアプリ側の chat 操作を提供します。
 */
export class ChatService {
  private readonly requester: GatewayRequester;
  private readonly eventSource?: GatewayEventSource;
  private readonly now: () => number;
  private readonly randomId: () => string;

  /**
   * Creates a chat service using Gateway requester and optional event source.
   * Gateway requester と任意のイベントソースを使う chat サービスを生成します。
   *
   * @param requester - Gateway requester (`GatewayClient` compatible).
   *                    Gateway リクエスタ（`GatewayClient` 互換）。
   * @param options - Optional event/time/random dependencies.
   *                  任意の event/time/random 依存。
   */
  constructor(requester: GatewayRequester, options: ChatServiceOptions = {}) {
    this.requester = requester;
    this.eventSource = options.eventSource;
    this.now = options.now ?? Date.now;
    this.randomId = options.randomId ?? (() => Math.random().toString(36).slice(2));
  }

  /**
   * Loads chat history for a session.
   * 指定 session の chat 履歴を読み込みます。
   *
   * @param params - `chat.history` request parameters.
   *                 `chat.history` リクエストパラメータ。
   * @returns Parsed `chat.history` response.
   *          解析済みの `chat.history` レスポンス。
   */
  async getHistory(params: ChatHistoryParams): Promise<ChatHistoryResult> {
    const payload = await this.requester.request("chat.history", params);
    return parseHistoryResult(payload);
  }

  /**
   * Sends a message to a session with idempotent run id.
   * 冪等な run id を用いて session にメッセージを送信します。
   *
   * @param input - App-side send input.
   *                アプリ側の送信入力。
   * @returns Parsed send ack payload.
   *          解析済みの送信 ack payload。
   */
  async send(input: ChatSendInput): Promise<ChatSendAck> {
    const idempotencyKey = input.idempotencyKey ?? this.createIdempotencyKey(input.sessionKey);
    const params: ChatSendParams = {
      sessionKey: input.sessionKey,
      message: input.message,
      thinking: input.thinking,
      deliver: input.deliver,
      attachments: input.attachments,
      timeoutMs: input.timeoutMs,
      idempotencyKey,
    };
    const payload = await this.requester.request("chat.send", params);
    return parseSendAck(payload);
  }

  /**
   * Requests abort for in-flight chat runs.
   * 進行中の chat 実行の abort を要求します。
   *
   * @param params - `chat.abort` parameters.
   *                 `chat.abort` パラメータ。
   * @returns Parsed abort result.
   *          解析済み abort 結果。
   */
  async abort(params: ChatAbortParams): Promise<ChatAbortResult> {
    const payload = await this.requester.request("chat.abort", params);
    return parseAbortResult(payload);
  }

  /**
   * Subscribes to Gateway `event: "chat"` stream.
   * Gateway `event: "chat"` ストリームを購読します。
   *
   * @param listener - Chat event callback.
   *                   chat イベントコールバック。
   * @param filter - Optional session/run filters.
   *                 任意の session/run フィルタ。
   * @returns Unsubscribe function.
   *          購読解除関数。
   */
  onChatEvent(listener: ChatEventListener, filter: ChatEventFilter = {}): () => void {
    if (!this.eventSource) {
      throw new Error("Chat event source is not configured");
    }
    return this.eventSource.onEvent("chat", (rawPayload, packet) => {
      const payload = parseChatEventPayload(rawPayload);
      if (!payload) {
        return;
      }
      if (filter.sessionKey && payload.sessionKey !== filter.sessionKey) {
        return;
      }
      if (filter.runId && payload.runId !== filter.runId) {
        return;
      }
      listener(payload, packet);
    });
  }

  private createIdempotencyKey(sessionKey: string): string {
    return `${sessionKey}:${this.now()}:${this.randomId()}`;
  }
}
