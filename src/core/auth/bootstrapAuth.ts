import type { SecureStoreAdapter } from "../security/secureStore";
import { loadGatewayConnectionSecrets } from "../security/connectionSecrets";

/**
 * Checks whether Gateway connection secrets are already persisted.
 * Gateway 接続シークレットが既に保存済みかどうかを判定します。
 *
 * @param store - Secure storage adapter.
 *                セキュアストレージアダプタ。
 * @returns `true` when both gateway URL and token exist, otherwise `false`.
 *          gateway URL と token の両方が存在すれば `true`、それ以外は `false`。
 */
export async function hasPersistedGatewayConnectionSecrets(
  store: SecureStoreAdapter,
): Promise<boolean> {
  const secrets = await loadGatewayConnectionSecrets(store);
  return secrets.gatewayUrl.trim().length > 0 && secrets.token.trim().length > 0;
}
