/**
 * Parameters accepted by Gateway `sessions.list`.
 * Gateway `sessions.list` が受け付けるパラメータです。
 */
export type SessionsListParams = {
  limit?: number;
  activeMinutes?: number;
  includeGlobal?: boolean;
  includeUnknown?: boolean;
  includeDerivedTitles?: boolean;
  includeLastMessage?: boolean;
  label?: string;
  spawnedBy?: string;
  agentId?: string;
  search?: string;
};

/**
 * Raw row shape returned in `sessions.list`.
 * `sessions.list` で返される生の行データです。
 */
export type GatewaySessionRow = {
  key: string;
  kind?: string;
  label?: string | null;
  displayName?: string | null;
  derivedTitle?: string | null;
  lastMessagePreview?: string | null;
  updatedAt?: number | string | null;
  sessionId?: string | null;
  thinkingLevel?: string | null;
  verboseLevel?: string | null;
  reasoningLevel?: string | null;
  sendPolicy?: string | null;
  modelProvider?: string | null;
  model?: string | null;
};

/**
 * Result returned by Gateway `sessions.list`.
 * Gateway `sessions.list` が返す結果です。
 */
export type SessionsListResult = {
  ts?: number | null;
  path?: string | null;
  count?: number | null;
  defaults?: Record<string, unknown> | null;
  sessions: GatewaySessionRow[];
};

/**
 * Parameters accepted by Gateway `sessions.patch`.
 * Gateway `sessions.patch` が受け付けるパラメータです。
 */
export type SessionsPatchParams = {
  key: string;
  label?: string | null;
  thinkingLevel?: string | null;
  verboseLevel?: string | null;
  reasoningLevel?: string | null;
  responseUsage?: string | null;
  elevatedLevel?: string | null;
  execHost?: string | null;
  execSecurity?: string | null;
  execAsk?: string | null;
  execNode?: string | null;
  model?: string | null;
  spawnedBy?: string | null;
  spawnDepth?: number | null;
  sendPolicy?: string | null;
  groupActivation?: string | null;
};

/**
 * Result returned by Gateway `sessions.patch`.
 * Gateway `sessions.patch` が返す結果です。
 */
export type SessionsPatchResult = {
  ok: boolean;
  path?: string | null;
  key: string;
  entry?: Record<string, unknown> | null;
  resolved?: Record<string, unknown> | null;
};

/**
 * Normalized session model for app-side list rendering.
 * アプリ側の一覧表示向けに正規化した session モデルです。
 */
export type SessionListItem = {
  key: string;
  label: string;
  updatedAt: number;
  preview: string;
  pinned: boolean;
  row: GatewaySessionRow;
};

/**
 * Query options for app-side session list preparation.
 * アプリ側で session 一覧を構築するためのクエリオプションです。
 */
export type SessionListQuery = {
  search?: string;
  gatewayParams?: SessionsListParams;
};
