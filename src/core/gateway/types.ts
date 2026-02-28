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
  /**
   * Discriminator for request frames.
   * リクエストフレームを示す判別子です。
   */
  type: "req";
  /**
   * Client-generated request identifier.
   * クライアントが生成するリクエスト識別子です。
   */
  id: string;
  /**
   * Gateway method name to invoke.
   * 呼び出す Gateway メソッド名です。
   */
  method: string;
  /**
   * Method-specific input payload.
   * メソッド固有の入力 payload です。
   */
  params?: unknown;
};

/**
 * Describes structured Gateway error details.
 * 構造化された Gateway エラー詳細を表します。
 */
export type GatewayErrorDetail = {
  /**
   * Stable error code returned by Gateway.
   * Gateway が返す安定したエラーコードです。
   */
  code?: string;
  /**
   * Human-readable error message.
   * 人が読めるエラーメッセージです。
   */
  message?: string;
};

/**
 * Represents an incoming Gateway response frame.
 * 受信する Gateway レスポンスフレームを表します。
 */
export type GatewayResponsePacket = {
  /**
   * Discriminator for response frames.
   * レスポンスフレームを示す判別子です。
   */
  type: "res";
  /**
   * Request identifier that this response corresponds to.
   * このレスポンスに対応するリクエスト識別子です。
   */
  id: string;
  /**
   * Indicates whether the request succeeded.
   * リクエストが成功したかどうかを示します。
   */
  ok: boolean;
  /**
   * Response payload when `ok` is true.
   * `ok` が true のときのレスポンス payload です。
   */
  payload?: unknown;
  /**
   * Error detail when `ok` is false.
   * `ok` が false のときのエラー詳細です。
   */
  error?: GatewayErrorDetail | string;
};

/**
 * Represents an incoming Gateway event frame.
 * 受信する Gateway イベントフレームを表します。
 */
export type GatewayEventPacket = {
  /**
   * Discriminator for event frames.
   * イベントフレームを示す判別子です。
   */
  type: "event";
  /**
   * Event name emitted by Gateway.
   * Gateway が発行したイベント名です。
   */
  event: string;
  /**
   * Event-specific payload.
   * イベント固有の payload です。
   */
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
  /**
   * Enables automatic reconnect on unexpected disconnects.
   * 想定外の切断時に自動再接続を有効化します。
   */
  enabled?: boolean;
  /**
   * Base delay for the first reconnect attempt in milliseconds.
   * 初回再接続試行の基準遅延（ミリ秒）です。
   */
  initialDelayMs?: number;
  /**
   * Upper bound for reconnect delay in milliseconds.
   * 再接続遅延の上限値（ミリ秒）です。
   */
  maxDelayMs?: number;
  /**
   * Exponential multiplier applied per retry attempt.
   * 試行ごとに適用する指数バックオフの乗数です。
   *
   * @remarks
   * Delay is calculated as `min(initialDelayMs * factor^(attempt-1), maxDelayMs)`.
   * 遅延は `min(initialDelayMs * factor^(attempt-1), maxDelayMs)` で計算します。
   */
  factor?: number;
};

/**
 * Provides a WebSocket-like constructor result for GatewayClient.
 * GatewayClient が利用する WebSocket 互換オブジェクトを表します。
 */
export type GatewayWebSocketLike = {
  /**
   * Current WebSocket ready state.
   * 現在の WebSocket readyState です。
   */
  readonly readyState: number;
  /**
   * Called when socket open handshake completes.
   * ソケットの open ハンドシェイク完了時に呼ばれます。
   */
  onopen: (() => void) | null;
  /**
   * Called when a message frame arrives.
   * メッセージフレーム受信時に呼ばれます。
   */
  onmessage: ((event: { data: string | ArrayBuffer | ArrayBufferView }) => void) | null;
  /**
   * Called when a transport-level error happens.
   * 伝送レベルのエラー発生時に呼ばれます。
   */
  onerror: ((event: unknown) => void) | null;
  /**
   * Called when the socket is closed.
   * ソケットが閉じられたときに呼ばれます。
   */
  onclose: (() => void) | null;
  /**
   * Sends a serialized message.
   * シリアライズ済みメッセージを送信します。
   */
  send(data: string): void;
  /**
   * Closes the socket.
   * ソケットを閉じます。
   */
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
  /**
   * Gateway websocket endpoint URL.
   * Gateway の WebSocket エンドポイント URL です。
   */
  gatewayUrl: string;
  /**
   * Builder that converts challenge payload to connect params.
   * challenge payload を connect params に変換する builder です。
   */
  buildConnectParams: GatewayConnectParamsBuilder;
};

/**
 * Configuration for constructing GatewayClient.
 * GatewayClient 構築時の設定です。
 */
export type GatewayClientOptions = {
  /**
   * Reconnect strategy configuration.
   * 再接続戦略の設定です。
   */
  reconnect?: GatewayReconnectOptions;
  /**
   * Factory for creating WebSocket-like instances.
   * WebSocket 互換インスタンスを生成するファクトリです。
   */
  createWebSocket?: (url: string) => GatewayWebSocketLike;
  /**
   * Timer scheduler used for reconnect delays.
   * 再接続遅延に使うタイマースケジューラです。
   */
  scheduleTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  /**
   * Timer canceller paired with `scheduleTimeout`.
   * `scheduleTimeout` と対になるタイマー解除関数です。
   */
  clearScheduledTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
  /**
   * Time provider used for request id generation.
   * リクエスト ID 生成に使う時刻プロバイダです。
   */
  now?: () => number;
  /**
   * Random suffix provider used for request id generation.
   * リクエスト ID 生成に使うランダムサフィックス提供関数です。
   */
  randomId?: () => string;
  /**
   * Callback fired when connection status changes.
   * 接続状態が変化したときに呼ばれるコールバックです。
   */
  onStatusChange?: (status: GatewayConnectionStatus, detail: string) => void;
  /**
   * Optional log sink for client diagnostics.
   * クライアント診断ログの出力先です。
   */
  onLog?: (line: string) => void;
};
