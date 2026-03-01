import type { SecureStoreAdapter } from "../security/secureStore";
import type {
  GatewaySessionRow,
  SessionListItem,
  SessionListQuery,
  SessionsListParams,
  SessionsListResult,
  SessionsPatchParams,
  SessionsPatchResult,
  SessionsResetParams,
  SessionsResetReason,
  SessionsResetResult,
} from "./types";

const SESSION_PINS_KEY = "openpocket.sessions.pins.v1";
const SESSION_LOCAL_LABELS_KEY = "openpocket.sessions.localLabels.v1";

type GatewayRequester = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toEpochMillis(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function buildDisplayLabel(row: GatewaySessionRow): string {
  const candidate = row.label ?? row.derivedTitle ?? row.displayName ?? row.key;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : row.key;
}

function buildPreview(row: GatewaySessionRow): string {
  const candidate = row.lastMessagePreview ?? row.derivedTitle ?? "";
  return typeof candidate === "string" ? candidate : "";
}

function toListResult(payload: unknown): SessionsListResult {
  if (!isRecord(payload) || !Array.isArray(payload.sessions)) {
    throw new Error("Invalid sessions.list response payload");
  }
  return payload as SessionsListResult;
}

/**
 * Provides app-side session list and update operations backed by Gateway methods.
 * Gateway メソッドを用いてアプリ側の session 一覧取得・更新操作を提供します。
 */
export class SessionsService {
  private readonly requester: GatewayRequester;
  private readonly store: SecureStoreAdapter;
  private readonly pinsKey: string;
  private readonly localLabelsKey: string;

  /**
   * Creates a session service using Gateway requester and secure storage.
   * Gateway requester とセキュアストレージを使う session サービスを生成します。
   *
   * @param requester - Gateway requester (`GatewayClient` compatible).
   *                    Gateway リクエスタ（`GatewayClient` 互換）。
   * @param store - Secure store adapter used for local pin persistence.
   *                ローカル pin 永続化に使うセキュアストアアダプタ。
   * @param pinsStorageKey - Optional storage key override for pinned session keys.
   *                         pin 済み session key の保存キー（任意、上書き用）。
   */
  constructor(
    requester: GatewayRequester,
    store: SecureStoreAdapter,
    pinsStorageKey: string = SESSION_PINS_KEY,
    localLabelsStorageKey: string = SESSION_LOCAL_LABELS_KEY,
  ) {
    this.requester = requester;
    this.store = store;
    this.pinsKey = pinsStorageKey;
    this.localLabelsKey = localLabelsStorageKey;
  }

  /**
   * Loads sessions from Gateway, then applies local pin/search/sort rules.
   * Gateway から session を取得し、ローカルの pin・検索・並び替えルールを適用します。
   *
   * @param query - Optional query for gateway params and local search text.
   *                Gateway パラメータとローカル検索文字列の任意クエリ。
   * @returns Normalized session list (pinned first, then recently updated).
   *          正規化済み session 一覧（pin 優先、その後に最近更新順）。
   */
  async listSessions(query: SessionListQuery = {}): Promise<SessionListItem[]> {
    const gatewayParams: SessionsListParams = {
      includeDerivedTitles: true,
      includeLastMessage: true,
      ...query.gatewayParams,
    };

    const payload = await this.requester.request("sessions.list", gatewayParams);
    const result = toListResult(payload);
    const pinnedKeys = await this.getPinnedKeys();
    const localLabels = await this.getLocalSessionLabels();
    const normalizedSearch = normalizeText(query.search ?? "");

    const mapped = result.sessions.map((row) => {
      const updatedAt = toEpochMillis(row.updatedAt);
      const localLabel = localLabels[row.key];
      return {
        key: row.key,
        label:
          typeof localLabel === "string" && localLabel.trim().length > 0
            ? localLabel
            : buildDisplayLabel(row),
        preview: buildPreview(row),
        updatedAt,
        pinned: pinnedKeys.has(row.key),
        row,
      } satisfies SessionListItem;
    });

    const filtered =
      normalizedSearch.length === 0
        ? mapped
        : mapped.filter((item) => {
            const key = normalizeText(item.key);
            const label = normalizeText(item.label);
            return key.includes(normalizedSearch) || label.includes(normalizedSearch);
          });

    return filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return b.updatedAt - a.updatedAt;
    });
  }

  /**
   * Updates a session label through Gateway `sessions.patch`.
   * Gateway `sessions.patch` を通じて session ラベルを更新します。
   *
   * @param key - Session key to update.
   *              更新対象の session key。
   * @param label - Next label. Empty string is normalized to `null`.
   *                更新後のラベル。空文字は `null` に正規化されます。
   * @returns Patch result from Gateway.
   *          Gateway からの patch 結果。
   */
  async updateSessionLabel(key: string, label: string | null): Promise<SessionsPatchResult> {
    const normalizedLabel = label === null ? null : label.trim().length === 0 ? null : label.trim();
    const params: SessionsPatchParams = { key, label: normalizedLabel };
    return this.requester.request<SessionsPatchResult>("sessions.patch", params);
  }

  /**
   * Updates a session model through Gateway `sessions.patch`.
   * Gateway `sessions.patch` を通じて session モデルを更新します。
   *
   * @param key - Session key to update.
   *              更新対象の session key。
   * @param model - Next model id. Empty string is normalized to `null`.
   *                更新後のモデル ID。空文字は `null` に正規化されます。
   * @returns Patch result from Gateway.
   *          Gateway からの patch 結果。
   */
  async updateSessionModel(key: string, model: string | null): Promise<SessionsPatchResult> {
    const normalizedModel = model === null ? null : model.trim().length === 0 ? null : model.trim();
    const params: SessionsPatchParams = { key, model: normalizedModel };
    return this.requester.request<SessionsPatchResult>("sessions.patch", params);
  }

  /**
   * Resets a session context through Gateway `sessions.reset`.
   * Gateway `sessions.reset` を通じて session コンテキストをリセットします。
   *
   * @param key - Session key to reset or initialize.
   *              リセットまたは初期化対象の session key。
   * @param reason - Reset reason (`new` creates/initializes fresh context).
   *                 リセット理由（`new` は新規/初期コンテキストを作成）。
   * @returns Reset result from Gateway.
   *          Gateway からの reset 結果。
   */
  async resetSession(
    key: string,
    reason: SessionsResetReason = "reset",
  ): Promise<SessionsResetResult> {
    const params: SessionsResetParams = { key, reason };
    return this.requester.request<SessionsResetResult>("sessions.reset", params);
  }

  /**
   * Returns locally pinned session keys.
   * ローカルで pin 済みの session key を返します。
   *
   * @returns Set of pinned session keys.
   *          pin 済み session key の集合。
   */
  async getPinnedKeys(): Promise<Set<string>> {
    const raw = await this.store.getItem(this.pinsKey);
    if (!raw) {
      return new Set();
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      const keys = parsed.filter((value): value is string => typeof value === "string");
      return new Set(keys);
    } catch {
      return new Set();
    }
  }

  /**
   * Sets or clears local pin state for a session key.
   * session key のローカル pin 状態を設定または解除します。
   *
   * @param key - Session key to update.
   *              更新対象の session key。
   * @param pinned - `true` to pin, `false` to unpin.
   *                 `true` で pin、`false` で pin 解除。
   * @returns Updated set of pinned keys.
   *          更新後の pin 済み key 集合。
   */
  async setPinned(key: string, pinned: boolean): Promise<Set<string>> {
    const current = await this.getPinnedKeys();
    if (pinned) {
      current.add(key);
    } else {
      current.delete(key);
    }
    await this.store.setItem(this.pinsKey, JSON.stringify(Array.from(current.values())));
    return current;
  }

  /**
   * Toggles local pin state for a session key.
   * session key のローカル pin 状態をトグルします。
   *
   * @param key - Session key to toggle.
   *              トグル対象の session key。
   * @returns Updated pin state (`true` when pinned).
   *          更新後の pin 状態（pin 済みなら `true`）。
   */
  async togglePinned(key: string): Promise<boolean> {
    const current = await this.getPinnedKeys();
    const nextPinned = !current.has(key);
    await this.setPinned(key, nextPinned);
    return nextPinned;
  }

  /**
   * Returns locally persisted session labels keyed by session key.
   * session key をキーにしたローカル永続ラベルのマップを返します。
   *
   * @returns Session-keyed local label map.
   *          session key ごとのローカルラベルマップ。
   */
  async getLocalSessionLabels(): Promise<Record<string, string>> {
    const raw = await this.store.getItem(this.localLabelsKey);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed)) {
        return {};
      }
      const entries = Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      );
      return Object.fromEntries(entries);
    } catch {
      return {};
    }
  }

  /**
   * Sets or clears a local-only session label override.
   * ローカル表示専用の session ラベル上書きを設定または解除します。
   *
   * @param key - Session key to update.
   *              更新対象の session key。
   * @param label - Local label override. Empty value clears the override.
   *                ローカル上書きラベル。空値を渡すと上書きを解除します。
   */
  async setLocalSessionLabel(key: string, label: string | null): Promise<void> {
    const labels = await this.getLocalSessionLabels();
    const normalizedLabel = label === null ? "" : label.trim();
    if (normalizedLabel.length === 0) {
      delete labels[key];
    } else {
      labels[key] = normalizedLabel;
    }
    await this.store.setItem(this.localLabelsKey, JSON.stringify(labels));
  }
}
