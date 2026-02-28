import type {
  GatewayClientOptions,
  GatewayConnectInput,
  GatewayConnectionStatus,
  GatewayEventPacket,
  GatewayPacket,
  GatewayRequestPacket,
  GatewayResponsePacket,
  GatewayWebSocketLike,
} from "./types";

/**
 * Stores resolve/reject callbacks for an in-flight request.
 * 送信中リクエストの resolve/reject コールバックを保持します。
 */
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

/**
 * Handles a single Gateway event notification.
 * Gateway のイベント通知 1 件を処理するリスナーです。
 *
 * @param payload - Event payload.
 *                  イベント payload。
 * @param packet - Raw event packet metadata.
 *                 生のイベント packet 情報。
 */
type EventListener = (payload: unknown, packet: GatewayEventPacket) => void;

/**
 * Provides fallback reconnect parameters.
 * 再接続時の既定パラメータを提供します。
 */
const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelayMs: 1_000,
  maxDelayMs: 15_000,
  factor: 2,
} as const;

/**
 * Checks whether a value is a non-null object record.
 * 値が null ではないオブジェクトレコードかを判定します。
 *
 * @param value - Value to inspect.
 *                判定対象の値。
 * @returns True when the value is a record object.
 *          値がレコードオブジェクトなら true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Normalizes unknown thrown values to `Error`.
 * 不明な throw 値を `Error` に正規化します。
 *
 * @param error - Unknown thrown value.
 *                throw された不明値。
 * @returns Normalized `Error` instance.
 *          正規化した `Error` インスタンス。
 */
function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : "Unknown gateway error");
}

/**
 * Masks secret text by exposing only its length.
 * 機密文字列を長さだけ残してマスクします。
 *
 * @param value - Secret string.
 *                機密文字列。
 * @returns Redacted string with length metadata.
 *          長さ情報のみを含むマスク文字列。
 */
function sanitizeSecret(value: string): string {
  return `<redacted:${value.length}>`;
}

/**
 * Recursively redacts token/password/secret fields for safe logging.
 * 安全なログ出力のため token/password/secret フィールドを再帰的にマスクします。
 *
 * @param input - Arbitrary value to sanitize.
 *                マスク対象の任意値。
 * @returns Sanitized value.
 *          マスク済みの値。
 */
function sanitizeForLog(input: unknown): unknown {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeForLog);
  }

  if (!isRecord(input)) {
    return input;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (
      typeof value === "string" &&
      (lower.includes("token") || lower.includes("password") || lower.includes("secret"))
    ) {
      next[key] = sanitizeSecret(value);
      continue;
    }
    next[key] = sanitizeForLog(value);
  }
  return next;
}

/**
 * Parses websocket data into a Gateway packet when valid JSON.
 * WebSocket データが妥当な JSON の場合に Gateway packet へ変換します。
 *
 * @param raw - Raw websocket message data.
 *              WebSocket の生メッセージデータ。
 * @returns Parsed packet, or `null` when invalid.
 *          変換した packet。無効な場合は `null`。
 */
function parsePacket(raw: string | ArrayBuffer | ArrayBufferView): GatewayPacket | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as GatewayPacket;
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Minimal core Gateway client for connect/request/event/reconnect responsibilities.
 * connect/request/event/reconnect の責務を担う最小構成の core Gateway クライアントです。
 */
export class GatewayClient {
  private readonly createWebSocket: (url: string) => GatewayWebSocketLike;
  private readonly scheduleTimeout: (
    callback: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearScheduledTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly onStatusChange?: GatewayClientOptions["onStatusChange"];
  private readonly onLog?: GatewayClientOptions["onLog"];

  private readonly reconnectEnabled: boolean;
  private readonly reconnectInitialDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly reconnectFactor: number;

  private socket: GatewayWebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private shouldReconnect = false;
  private connectInput: GatewayConnectInput | null = null;
  private isReconnectFlow = false;

  private status: GatewayConnectionStatus = "disconnected";

  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly eventListeners = new Map<string, Set<EventListener>>();

  /**
   * Creates a GatewayClient with optional transport/time/log dependencies.
   * 送受信・時刻・ログ依存を任意で差し替え可能な GatewayClient を生成します。
   *
   * @param options - Runtime and dependency options.
   *                  実行時および依存差し替えオプション。
   */
  constructor(options: GatewayClientOptions = {}) {
    this.createWebSocket =
      options.createWebSocket ??
      ((url: string) => {
        return new WebSocket(url) as unknown as GatewayWebSocketLike;
      });
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout;
    this.clearScheduledTimeout = options.clearScheduledTimeout ?? clearTimeout;
    this.now = options.now ?? Date.now;
    this.randomId = options.randomId ?? (() => Math.random().toString(36).slice(2));
    this.onStatusChange = options.onStatusChange;
    this.onLog = options.onLog;

    this.reconnectEnabled = options.reconnect?.enabled ?? DEFAULT_RECONNECT.enabled;
    this.reconnectInitialDelayMs =
      options.reconnect?.initialDelayMs ?? DEFAULT_RECONNECT.initialDelayMs;
    this.reconnectMaxDelayMs = options.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs;
    this.reconnectFactor = options.reconnect?.factor ?? DEFAULT_RECONNECT.factor;
  }

  /**
   * Returns the latest connection status.
   * 現在の接続状態を返します。
   *
   * @returns The current connection status.
   *          現在の接続状態。
   */
  getStatus(): GatewayConnectionStatus {
    return this.status;
  }

  /**
   * Opens websocket, waits for `connect.challenge`, and sends `connect`.
   * WebSocket を開き、`connect.challenge` を待って `connect` を送信します。
   *
   * @param input - Connection input and challenge response builder.
   *                接続入力と challenge 応答 builder。
   * @returns The `connect` response payload.
   *          `connect` のレスポンス payload。
   */
  async connect(input: GatewayConnectInput): Promise<unknown> {
    this.connectInput = input;
    this.shouldReconnect = true;
    this.clearReconnectTimer();
    this.disconnectSocket();
    this.rejectAllPending("connect restarted");

    this.setStatus(this.isReconnectFlow ? "reconnecting" : "connecting", "Opening websocket");
    try {
      const hello = await this.openAndHandshake(input, this.isReconnectFlow);
      this.reconnectAttempt = 0;
      this.isReconnectFlow = false;
      return hello;
    } catch (error) {
      const normalized = normalizeError(error);
      this.setStatus("error", normalized.message);
      this.scheduleReconnect("connect failed");
      throw normalized;
    }
  }

  /**
   * Closes websocket and cancels auto reconnect.
   * WebSocket を閉じ、自動再接続を停止します。
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.isReconnectFlow = false;
    this.clearReconnectTimer();
    this.disconnectSocket();
    this.rejectAllPending("disconnected");
    this.setStatus("disconnected", "Disconnected by user");
  }

  /**
   * Sends a Gateway request packet and resolves when matching response arrives.
   * Gateway のリクエスト packet を送信し、対応するレスポンス到着時に解決します。
   *
   * @param method - Gateway method name.
   *                 Gateway のメソッド名。
   * @param params - Optional request params.
   *                 任意のリクエスト params。
   * @returns Response payload.
   *          レスポンス payload。
   */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.socket || this.socket.readyState !== 1) {
      return Promise.reject(new Error("Socket is not connected"));
    }

    const id = `${this.now()}_${this.randomId()}`;
    const packet: GatewayRequestPacket = { type: "req", id, method, params };

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });

      try {
        this.socket?.send(JSON.stringify(packet));
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(normalizeError(error));
      }
    });
  }

  /**
   * Subscribes to a specific event name (or `*` for all events).
   * 特定イベント名（または `*` ですべて）を購読します。
   *
   * @param event - Event name to subscribe.
   *                購読するイベント名。
   * @param listener - Callback invoked on event.
   *                   イベント受信時に呼ばれるコールバック。
   * @returns Unsubscribe function.
   *          購読解除関数。
   */
  onEvent(event: string, listener: EventListener): () => void {
    const set = this.eventListeners.get(event) ?? new Set<EventListener>();
    set.add(listener);
    this.eventListeners.set(event, set);

    return () => {
      const existing = this.eventListeners.get(event);
      if (!existing) {
        return;
      }
      existing.delete(listener);
      if (existing.size === 0) {
        this.eventListeners.delete(event);
      }
    };
  }

  /**
   * Opens a socket and completes the `connect.challenge` -> `connect` handshake.
   * ソケットを開いて `connect.challenge` -> `connect` ハンドシェイクを完了します。
   *
   * @param input - Connect input containing URL and connect params builder.
   *                URL と connect params builder を含む接続入力。
   * @param isReconnect - Whether this attempt is a reconnect flow.
   *                      この試行が再接続フローかどうか。
   * @returns Connect response payload when handshake succeeds.
   *          ハンドシェイク成功時の connect レスポンス payload。
   */
  private openAndHandshake(input: GatewayConnectInput, isReconnect: boolean): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      let handshakeDone = false;
      const socket = this.createWebSocket(input.gatewayUrl);
      this.socket = socket;

      const settleReject = (error: Error): void => {
        if (!handshakeDone) {
          reject(error);
        }
      };

      socket.onopen = () => {
        this.log(isReconnect ? "WS opened (reconnect)" : "WS opened");
        this.setStatus(isReconnect ? "reconnecting" : "connecting", "WS opened");
      };

      socket.onerror = () => {
        const error = new Error("WebSocket error");
        this.log(error.message);
        settleReject(error);
      };

      socket.onmessage = (event) => {
        const packet = parsePacket(event.data);
        if (!packet) {
          this.log("Ignored non-JSON packet");
          return;
        }

        if (packet.type === "res") {
          this.handleResponsePacket(packet);
          return;
        }

        this.emitEvent(packet);

        if (packet.event === "connect.challenge" && !handshakeDone) {
          void (async () => {
            try {
              const connectParams = await input.buildConnectParams(packet.payload);
              this.log(`connect params: ${JSON.stringify(sanitizeForLog(connectParams))}`);
              const hello = await this.request("connect", connectParams);
              handshakeDone = true;
              this.setStatus("connected", "Connected");
              resolve(hello);
            } catch (error) {
              const normalized = normalizeError(error);
              this.log(`connect failed: ${normalized.message}`);
              settleReject(normalized);
              this.disconnectSocket();
            }
          })();
        }
      };

      socket.onclose = () => {
        const wasConnected = this.status === "connected";
        this.socket = null;
        this.rejectAllPending("socket closed");

        if (!handshakeDone) {
          settleReject(new Error("Socket closed before handshake"));
        }

        if (this.shouldReconnect && this.reconnectEnabled) {
          this.scheduleReconnect("socket closed");
          return;
        }

        this.setStatus("disconnected", wasConnected ? "Socket closed" : "Socket not connected");
      };
    });
  }

  /**
   * Resolves or rejects a pending request using a response packet.
   * レスポンス packet を使って pending リクエストを解決または失敗させます。
   *
   * @param packet - Response packet to apply.
   *                 適用するレスポンス packet。
   */
  private handleResponsePacket(packet: GatewayResponsePacket): void {
    const pending = this.pendingRequests.get(packet.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(packet.id);

    if (packet.ok) {
      pending.resolve(packet.payload);
      return;
    }

    const message =
      typeof packet.error === "string"
        ? packet.error
        : (packet.error?.message ?? packet.error?.code ?? "Gateway request failed");
    pending.reject(new Error(message));
  }

  /**
   * Dispatches an event packet to named and wildcard listeners.
   * イベント packet を名前指定とワイルドカードのリスナーへ配送します。
   *
   * @param packet - Event packet to dispatch.
   *                 配送するイベント packet。
   */
  private emitEvent(packet: GatewayEventPacket): void {
    const named = this.eventListeners.get(packet.event);
    if (named) {
      for (const listener of named.values()) {
        listener(packet.payload, packet);
      }
    }

    const all = this.eventListeners.get("*");
    if (all) {
      for (const listener of all.values()) {
        listener(packet.payload, packet);
      }
    }
  }

  /**
   * Schedules reconnect with exponential backoff.
   * 指数バックオフで再接続をスケジュールします。
   *
   * @param reason - Reason text for status/log output.
   *                 ステータス/ログ出力用の理由文字列。
   */
  private scheduleReconnect(reason: string): void {
    if (!this.shouldReconnect || !this.reconnectEnabled || !this.connectInput) {
      return;
    }

    this.clearReconnectTimer();

    this.reconnectAttempt += 1;
    this.isReconnectFlow = true;

    const delay = Math.min(
      this.reconnectInitialDelayMs * this.reconnectFactor ** (this.reconnectAttempt - 1),
      this.reconnectMaxDelayMs,
    );

    this.setStatus("reconnecting", `${reason}, retry in ${delay}ms`);
    this.log(`reconnect scheduled in ${delay}ms (${reason})`);

    this.reconnectTimer = this.scheduleTimeout(() => {
      if (!this.shouldReconnect || !this.connectInput) {
        return;
      }

      void this.connect(this.connectInput).catch((error) => {
        this.log(`reconnect attempt failed: ${normalizeError(error).message}`);
      });
    }, delay);
  }

  /**
   * Cancels a scheduled reconnect timer when present.
   * 予約済みの再接続タイマーがあれば解除します。
   */
  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }
    this.clearScheduledTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /**
   * Closes and detaches current socket handlers.
   * 現在のソケットを閉じ、ハンドラ参照を解除します。
   */
  private disconnectSocket(): void {
    if (!this.socket) {
      return;
    }

    this.socket.onopen = null;
    this.socket.onmessage = null;
    this.socket.onerror = null;
    this.socket.onclose = null;

    try {
      this.socket.close();
    } catch {
      // Ignore close errors on already-closed sockets.
    }

    this.socket = null;
  }

  /**
   * Rejects every pending request with a shared error message.
   * すべての pending リクエストを共通エラーメッセージで失敗させます。
   *
   * @param message - Error message used for rejection.
   *                  reject に使うエラーメッセージ。
   */
  private rejectAllPending(message: string): void {
    const error = new Error(message);
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Updates internal status and emits status callback.
   * 内部ステータスを更新し、ステータスコールバックを通知します。
   *
   * @param status - Next connection status.
   *                 次の接続ステータス。
   * @param detail - Human-readable status detail.
   *                 人が読めるステータス詳細。
   */
  private setStatus(status: GatewayConnectionStatus, detail: string): void {
    this.status = status;
    this.onStatusChange?.(status, detail);
  }

  /**
   * Emits a single log line through the configured logger.
   * 設定されたロガーに 1 行ログを送ります。
   *
   * @param line - Log line text.
   *               ログ行テキスト。
   */
  private log(line: string): void {
    this.onLog?.(line);
  }
}
