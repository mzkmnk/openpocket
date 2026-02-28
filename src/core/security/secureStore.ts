/**
 * Minimal async key-value interface used for secure persistence.
 * セキュアな永続化に使う最小の非同期キー・バリューインターフェースです。
 */
export type SecureStoreAdapter = {
  /**
   * Reads a value for the given key.
   * 指定キーの値を読み込みます。
   *
   * @param key - Storage key.
   *              ストレージキー。
   * @returns Stored value, or `null` when missing.
   *          保存値。未保存なら `null`。
   */
  getItem(key: string): Promise<string | null>;
  /**
   * Persists a value for the given key.
   * 指定キーに値を保存します。
   *
   * @param key - Storage key.
   *              ストレージキー。
   * @param value - Value to persist.
   *                保存する値。
   */
  setItem(key: string, value: string): Promise<void>;
  /**
   * Removes a value for the given key.
   * 指定キーの値を削除します。
   *
   * @param key - Storage key.
   *              ストレージキー。
   */
  deleteItem(key: string): Promise<void>;
};
