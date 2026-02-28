const B64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return globalThis.btoa(binary);
  }

  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;

    const triple = (a << 16) | (b << 8) | c;
    out += B64_TABLE[(triple >> 18) & 63];
    out += B64_TABLE[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? B64_TABLE[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64_TABLE[triple & 63] : "=";
  }

  return out;
}

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.trim();
  if (typeof globalThis.atob === "function") {
    const bin = globalThis.atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  // Fallback decoder (minimal)
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const len = (clean.length * 3) / 4 - pad;
  const out = new Uint8Array(len);
  let outIdx = 0;
  const idx = (c: string) => B64_TABLE.indexOf(c);

  for (let i = 0; i < clean.length; i += 4) {
    const a = idx(clean[i] ?? "A");
    const b = idx(clean[i + 1] ?? "A");
    const c = clean[i + 2] === "=" ? 0 : idx(clean[i + 2] ?? "A");
    const d = clean[i + 3] === "=" ? 0 : idx(clean[i + 3] ?? "A");

    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (outIdx < out.length) out[outIdx++] = (triple >> 16) & 255;
    if (outIdx < out.length) out[outIdx++] = (triple >> 8) & 255;
    if (outIdx < out.length) out[outIdx++] = triple & 255;
  }

  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return base64ToBytes(padded);
}

export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes);
}
