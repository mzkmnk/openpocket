import type { GatewayEventPacket } from "../gateway/types";

/**
 * Parameters accepted by Gateway `chat.history`.
 * Gateway `chat.history` が受け付けるパラメータです。
 */
export type ChatHistoryParams = {
  sessionKey: string;
  limit?: number;
};

/**
 * Parameters accepted by Gateway `chat.send`.
 * Gateway `chat.send` が受け付けるパラメータです。
 */
export type ChatSendParams = {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver?: boolean;
  attachments?: unknown[];
  timeoutMs?: number;
  idempotencyKey: string;
};

/**
 * Input accepted by app-side chat send helper.
 * アプリ側の送信ヘルパーが受け付ける入力です。
 */
export type ChatSendInput = Omit<ChatSendParams, "idempotencyKey"> & {
  idempotencyKey?: string;
};

/**
 * Parameters accepted by Gateway `chat.abort`.
 * Gateway `chat.abort` が受け付けるパラメータです。
 */
export type ChatAbortParams = {
  sessionKey: string;
  runId?: string;
};

/**
 * Result returned by Gateway `chat.history`.
 * Gateway `chat.history` が返す結果です。
 */
export type ChatHistoryResult = {
  sessionKey: string;
  sessionId?: string | null;
  messages: unknown[];
  thinkingLevel?: string | null;
  verboseLevel?: string | null;
};

/**
 * Ack payload returned by Gateway `chat.send`.
 * Gateway `chat.send` が返す ack payload です。
 */
export type ChatSendAck =
  | { runId: string; status: "started" }
  | { runId: string; status: "in_flight" }
  | { runId: string; status: "ok" }
  | { runId: string; status: "error"; summary: string };

/**
 * Result returned by Gateway `chat.abort`.
 * Gateway `chat.abort` が返す結果です。
 */
export type ChatAbortResult = {
  ok: true;
  aborted: boolean;
  runIds: string[];
};

/**
 * Chat stream state emitted by Gateway event payload.
 * Gateway イベント payload で通知されるチャットのストリーム状態です。
 */
export type ChatEventState = "delta" | "final" | "aborted" | "error";

/**
 * Payload emitted in `event: "chat"`.
 * `event: "chat"` で通知される payload です。
 */
export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: ChatEventState;
  message?: unknown;
  errorMessage?: string;
  usage?: unknown;
  stopReason?: string;
};

/**
 * Callback for normalized chat events.
 * 正規化済み chat イベントを受け取るコールバックです。
 *
 * @param payload - Parsed chat event payload.
 *                  解析済みの chat イベント payload。
 * @param packet - Raw Gateway event packet.
 *                 生の Gateway イベント packet。
 */
export type ChatEventListener = (payload: ChatEventPayload, packet: GatewayEventPacket) => void;

