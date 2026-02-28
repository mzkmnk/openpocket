import type { SecureStoreAdapter } from "./secureStore";

const GATEWAY_TOKEN_KEY = "openpocket.gateway.token";
const GATEWAY_URL_KEY = "openpocket.gateway.url";

/**
 * User-provided connection settings used for Gateway connect.
 * Gateway 接続に使うユーザー入力の接続設定です。
 */
export type GatewayConnectionSecrets = {
  /**
   * Gateway websocket URL.
   * Gateway WebSocket URL。
   */
  gatewayUrl: string;
  /**
   * Gateway token (must be handled as secret).
   * Gateway トークン（機密値として扱います）。
   */
  token: string;
};

/**
 * Loads persisted Gateway URL/token values.
 * 保存済みの Gateway URL/token を読み込みます。
 *
 * @param store - Secure storage adapter.
 *                セキュアストレージアダプタ。
 * @returns Loaded settings. Missing values become empty strings.
 *          読み込んだ設定。未保存値は空文字になります。
 */
export async function loadGatewayConnectionSecrets(
  store: SecureStoreAdapter,
): Promise<GatewayConnectionSecrets> {
  const [gatewayUrl, token] = await Promise.all([
    store.getItem(GATEWAY_URL_KEY),
    store.getItem(GATEWAY_TOKEN_KEY),
  ]);

  return {
    gatewayUrl: gatewayUrl ?? "",
    token: token ?? "",
  };
}

/**
 * Persists Gateway URL/token values.
 * Gateway URL/token を保存します。
 *
 * @param store - Secure storage adapter.
 *                セキュアストレージアダプタ。
 * @param value - Values to save.
 *                保存する値。
 */
export async function saveGatewayConnectionSecrets(
  store: SecureStoreAdapter,
  value: GatewayConnectionSecrets,
): Promise<void> {
  await Promise.all([
    store.setItem(GATEWAY_URL_KEY, value.gatewayUrl.trim()),
    store.setItem(GATEWAY_TOKEN_KEY, value.token.trim()),
  ]);
}

/**
 * Clears persisted Gateway URL/token values.
 * 保存済みの Gateway URL/token を削除します。
 *
 * @param store - Secure storage adapter.
 *                セキュアストレージアダプタ。
 */
export async function clearGatewayConnectionSecrets(store: SecureStoreAdapter): Promise<void> {
  await Promise.all([store.deleteItem(GATEWAY_URL_KEY), store.deleteItem(GATEWAY_TOKEN_KEY)]);
}
