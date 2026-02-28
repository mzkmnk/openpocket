import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import * as ed25519 from "@noble/ed25519";

import { base64UrlToBytes, bytesToBase64Url } from "./base64";
import type { DeviceIdentity } from "./types";

const STORAGE_KEY = "openpocket.poc.device.identity";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

    return {
      deviceId: parsed.deviceId,
      publicKey: parsed.publicKey,
      privateKey: parsed.privateKey,
      deviceToken: typeof parsed.deviceToken === "string" ? parsed.deviceToken : undefined,
    };
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
  const secretKey = randomBytes(32);
  const publicKey = await ed25519.getPublicKeyAsync(secretKey);

  // Use expo-crypto for sha256 to avoid WebCrypto dependency on native.
  const deviceId = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytesToHex(publicKey),
    { encoding: Crypto.CryptoEncoding.HEX },
  );

  const identity: DeviceIdentity = {
    deviceId,
    publicKey: bytesToBase64Url(publicKey),
    privateKey: bytesToBase64Url(secretKey),
  };

  await saveIdentity(identity);
  return identity;
}

export async function persistDeviceToken(identity: DeviceIdentity, deviceToken: string): Promise<DeviceIdentity> {
  const next = { ...identity, deviceToken };
  await saveIdentity(next);
  return next;
}

function signaturePayloadV2(args: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
}): string {
  return [
    "v2",
    args.deviceId,
    args.clientId,
    args.clientMode,
    args.role,
    args.scopes.join(","),
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
): Promise<{ signature: string; signedAt: number }> {
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

  const secretKey = base64UrlToBytes(identity.privateKey);
  const msg = new TextEncoder().encode(payload);
  const sig = await ed25519.signAsync(msg, secretKey);

  return {
    signature: bytesToBase64Url(sig),
    signedAt,
  };
}
