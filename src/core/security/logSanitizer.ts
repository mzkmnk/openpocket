/**
 * Masks secret text by exposing only its length.
 * 機密文字列を長さだけ残してマスクします。
 *
 * @param value - Secret string.
 *                機密文字列。
 * @returns Redacted string with length metadata.
 *          長さ情報のみを含むマスク文字列。
 */
export function sanitizeSecret(value: string): string {
  return `<redacted:${value.length}>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Recursively redacts secret-ish fields for safe logs.
 * 安全なログ出力のため機密性の高いフィールドを再帰的にマスクします。
 *
 * @param input - Value to sanitize.
 *                マスク対象の値。
 * @returns Sanitized value.
 *          マスク済みの値。
 */
export function sanitizeForLog(input: unknown): unknown {
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
      (lower.includes("token") ||
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("signature"))
    ) {
      next[key] = sanitizeSecret(value);
      continue;
    }
    next[key] = sanitizeForLog(value);
  }
  return next;
}
