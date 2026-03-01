/**
 * Model choice returned by Gateway `models.list`.
 * Gateway `models.list` が返すモデル選択肢です。
 */
export type ModelChoice = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
};

/**
 * Result returned by Gateway `models.list`.
 * Gateway `models.list` が返す結果です。
 */
export type ModelsListResult = {
  models: ModelChoice[];
};
