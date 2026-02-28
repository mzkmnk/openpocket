import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import nacl from "tweetnacl";
import { sha256 as sha256Hex } from "js-sha256";

import { base64UrlToBytes, bytesToBase64Url } from "./base64";
import type { DeviceIdentity } from "./types";

const STORAGE_KEY = "openpocket.poc.device.identity";

function deviceIdFromPublicKey(publicKey: Uint8Array): string {
  // Gateway: sha256(publicKeyRawBytes) -> hex
  return sha256Hex(publicKey);
}

function keyPairFromSeed(seed32: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const kp = nacl.sign.keyPair.fromSeed(seed32);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export async function verifySignature(
  identity: DeviceIdentity,
  payload: string,
  signatureB64Url: string,
): Promise<boolean> {
  const msg = new TextEncoder().encode(payload);
  const sigBytes = base64UrlToBytes(signatureB64Url);
  const pubBytes = base64UrlToBytes(identity.publicKey);
  return nacl.sign.detached.verify(msg, sigBytes, pubBytes);
}

async function readStoredIdentity(): Promise<DeviceIdentity | null> {
  const g = globalThis as any;
  const raw =
    Platform.OS === "web"
      ? g.localStorage?.getItem(STORAGE_KEY) ?? null
      : await SecureStore.getItemAsync(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
    if (
      typeof parsed.deviceId !== "string" ||
      typeof parsed.publicKey !== "string" ||
      typeof parsed.privateKey !== "string"
    ) {
      return null;
    }

    // Reject legacy formats (raw:/jwk:) to avoid device identity mismatch.
    if (parsed.publicKey.startsWith("raw:") || parsed.publicKey.startsWith("jwk:")) {
      return null;
    }
    if (parsed.privateKey.startsWith("raw:") || parsed.privateKey.startsWith("jwk:")) {
      return null;
    }

    // Source of truth: privateKey seed32. Derive publicKey + deviceId from it.
    const seed32 = base64UrlToBytes(parsed.privateKey);
    const { publicKey: derivedPublicKey } = keyPairFromSeed(seed32);
    const derivedPublicKeyB64Url = bytesToBase64Url(derivedPublicKey);
    const derivedDeviceId = deviceIdFromPublicKey(derivedPublicKey);

    const identity: DeviceIdentity = {
      deviceId: derivedDeviceId,
      publicKey: derivedPublicKeyB64Url,
      privateKey: parsed.privateKey,
      deviceToken: typeof parsed.deviceToken === "string" ? parsed.deviceToken : undefined,
    };

    // Self-heal any mismatch (older algorithms / mixed key formats).
    if (parsed.deviceId !== derivedDeviceId || parsed.publicKey !== derivedPublicKeyB64Url) {
      await saveIdentity(identity);
    }

    return identity;
  } catch {
    return null;
  }
}

async function saveIdentity(identity: DeviceIdentity): Promise<void> {
  const g = globalThis as any;
  const value = JSON.stringify(identity);
  if (Platform.OS === "web") {
    g.localStorage?.setItem(STORAGE_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(STORAGE_KEY, value);
}

function randomBytes(length: number): Uint8Array {
  const g = globalThis as any;
  if (typeof g.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    g.crypto.getRandomValues(bytes);
    return bytes;
  }

  return Crypto.getRandomBytes(length);
}

export async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  const existing = await readStoredIdentity();
  if (existing) {
    return existing;
  }

  // Align with Control UI device identity:
  // - privateKey: base64url(32-byte secret)
  // - publicKey: base64url(32-byte public)
  // - deviceId: sha256(publicKeyBytes) as hex
  const seed32 = randomBytes(32);
  const { publicKey } = keyPairFromSeed(seed32);

  const deviceId = deviceIdFromPublicKey(publicKey);

  const identity: DeviceIdentity = {
    deviceId,
    publicKey: bytesToBase64Url(publicKey),
    privateKey: bytesToBase64Url(seed32),
  };

  await saveIdentity(identity);
  return identity;
}

export async function persistDeviceToken(identity: DeviceIdentity, deviceToken: string): Promise<DeviceIdentity> {
  const next = { ...identity, deviceToken };
  await saveIdentity(next);
  return next;
}

export function signaturePayloadV2(args: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
}): string {
  const scopesCsv = args.scopes.join(",");
  return [
    "v2",
    args.deviceId,
    args.clientId,
    args.clientMode,
    args.role,
    scopesCsv,
    String(args.signedAtMs),
    args.token,
    args.nonce,
  ].join("|");
}

export async function makeSignature(
  identity: DeviceIdentity,
  args: {
    nonce: string;
    clientId: string;
    clientMode: string;
    role: string;
    scopes: string[];
    token?: string;
  },
): Promise<{
  signature: string;
  signedAt: number;
  payload: string;
  debug?: {
    verifyRaw: boolean;
    pubLen: number;
    sigLen: number;
    sigRoundtripOk: boolean;
  };
}> {
  const signedAt = Date.now();
  const payload = signaturePayloadV2({
    deviceId: identity.deviceId,
    clientId: args.clientId,
    clientMode: args.clientMode,
    role: args.role,
    scopes: args.scopes,
    signedAtMs: signedAt,
    token: args.token ?? "",
    nonce: args.nonce,
  });

  const seed32 = base64UrlToBytes(identity.privateKey);
  const { publicKey, secretKey } = keyPairFromSeed(seed32);
  const msg = new TextEncoder().encode(payload);
  const sig = nacl.sign.detached(msg, secretKey);

  // Debug: verify without base64 encoding to isolate failures.
  let debug: { verifyRaw: boolean; pubLen: number; sigLen: number; sigRoundtripOk: boolean } | undefined;
  try {
    const verifyRaw = nacl.sign.detached.verify(msg, sig, publicKey);
    const sigB64 = bytesToBase64Url(sig);
    const sigRoundtrip = base64UrlToBytes(sigB64);
    const sigRoundtripOk = sigRoundtrip.length === sig.length && sigRoundtrip.every((b, i) => b === sig[i]);
    debug = { verifyRaw, pubLen: publicKey.length, sigLen: sig.length, sigRoundtripOk };
  } catch {
    // ignore
  }

  return {
    signature: bytesToBase64Url(sig),
    signedAt,
    payload,
    debug,
  };
}
