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

export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes);
}
