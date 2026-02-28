/**
 * Represents lifecycle states of a Gateway connection.
 * Gateway 接続のライフサイクル状態を表します。
 */
export type GatewayConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * Represents an outgoing Gateway request frame.
 * 送信する Gateway リクエストフレームを表します。
 */
export type GatewayRequestPacket = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

/**
 * Represents an incoming Gateway response frame.
 * 受信する Gateway レスポンスフレームを表します。
 */
export type GatewayResponsePacket = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string } | string;
};

/**
 * Represents an incoming Gateway event frame.
 * 受信する Gateway イベントフレームを表します。
 */
export type GatewayEventPacket = {
  type: "event";
  event: string;
  payload?: unknown;
};

/**
 * Represents any Gateway frame handled by the client.
 * クライアントが扱う Gateway フレーム全体を表します。
 */
export type GatewayPacket = GatewayResponsePacket | GatewayEventPacket;

/**
 * Defines reconnect backoff behavior for Gateway websocket connections.
 * Gateway WebSocket 接続における再接続バックオフ挙動を定義します。
 */
export type GatewayReconnectOptions = {
  enabled?: boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
};

/**
 * Provides a WebSocket-like constructor result for GatewayClient.
 * GatewayClient が利用する WebSocket 互換オブジェクトを表します。
 */
export type GatewayWebSocketLike = {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer | ArrayBufferView }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
};

/**
 * Builds the Gateway `connect` request params from the challenge event payload.
 * `connect.challenge` イベントの payload から Gateway `connect` リクエスト params を組み立てます。
 *
 * @param challengePayload - The payload received in `connect.challenge`.
 *                           `connect.challenge` で受信した payload。
 * @returns Request params to send with `connect`.
 *          `connect` で送信するリクエスト params。
 */
export type GatewayConnectParamsBuilder = (challengePayload: unknown) => unknown | Promise<unknown>;

/**
 * Input for initiating a Gateway websocket session.
 * Gateway WebSocket セッション開始時の入力です。
 */
export type GatewayConnectInput = {
  gatewayUrl: string;
  buildConnectParams: GatewayConnectParamsBuilder;
};

/**
 * Configuration for constructing GatewayClient.
 * GatewayClient 構築時の設定です。
 */
export type GatewayClientOptions = {
  reconnect?: GatewayReconnectOptions;
  createWebSocket?: (url: string) => GatewayWebSocketLike;
  scheduleTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearScheduledTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
  now?: () => number;
  randomId?: () => string;
  onStatusChange?: (status: GatewayConnectionStatus, detail: string) => void;
  onLog?: (line: string) => void;
};
