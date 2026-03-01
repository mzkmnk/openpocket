/**
 * Summary row returned by Gateway `agents.list`.
 * Gateway `agents.list` が返す agent サマリー行です。
 */
export type GatewayAgentSummary = {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
};

/**
 * Parameters accepted by Gateway `agents.list`.
 * Gateway `agents.list` が受け付けるパラメータです。
 */
export type AgentsListParams = Record<string, never>;

/**
 * Result returned by Gateway `agents.list`.
 * Gateway `agents.list` が返す結果です。
 */
export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: "per-sender" | "global";
  agents: GatewayAgentSummary[];
};
