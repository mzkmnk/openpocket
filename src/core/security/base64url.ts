/**
 * Encodes bytes into URL-safe base64 without padding.
 * バイト列をパディングなしの URL-safe base64 に変換します。
 *
 * @param bytes - Raw bytes.
 *                生のバイト列。
 * @returns URL-safe base64 string.
 *          URL-safe base64 文字列。
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Decodes URL-safe base64 text into bytes.
 * URL-safe base64 文字列をバイト列に復号します。
 *
 * @param value - URL-safe base64 text.
 *                URL-safe base64 文字列。
 * @returns Decoded bytes.
 *          復号されたバイト列。
 */
export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(`${padded}${pad}`);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
