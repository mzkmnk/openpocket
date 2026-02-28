import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { bytesToBase64, utf8ToBase64 } from "./base64";
import type { DeviceIdentity } from "./types";
import { makeId } from "./utils";

const STORAGE_KEY = "openpocket.poc.device.identity";

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
  const g = globalThis as any;
  const existing = await readStoredIdentity();
  if (existing) {
    return existing;
  }

  if (g.crypto?.subtle) {
    try {
      const pair = await g.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
      const publicJwk = await g.crypto.subtle.exportKey("jwk", pair.publicKey);
      const privateJwk = await g.crypto.subtle.exportKey("jwk", pair.privateKey);

      const identity: DeviceIdentity = {
        deviceId: makeId("device"),
        publicKey: `jwk:${JSON.stringify(publicJwk)}`,
        privateKey: `jwk:${JSON.stringify(privateJwk)}`,
      };

      await saveIdentity(identity);
      return identity;
    } catch {
      // fall through
    }
  }

  const identity: DeviceIdentity = {
    deviceId: makeId("device"),
    publicKey: `raw:${bytesToBase64(randomBytes(32))}`,
    privateKey: `raw:${bytesToBase64(randomBytes(64))}`,
  };
  await saveIdentity(identity);
  return identity;
}

export async function persistDeviceToken(identity: DeviceIdentity, deviceToken: string): Promise<DeviceIdentity> {
  const next = { ...identity, deviceToken };
  await saveIdentity(next);
  return next;
}

export async function makeSignature(identity: DeviceIdentity, nonce: string): Promise<{ signature: string; signedAt: number }> {
  const g = globalThis as any;
  const signedAt = Date.now();
  const payload = `${identity.deviceId}:${nonce}:${signedAt}`;

  if (identity.privateKey.startsWith("jwk:") && g.crypto?.subtle) {
    try {
      const jwk = JSON.parse(identity.privateKey.slice(4));
      const key = await g.crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
      const signed = await g.crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(payload));
      return {
        signature: bytesToBase64(new Uint8Array(signed)),
        signedAt,
      };
    } catch {
      // fall through
    }
  }

  return {
    signature: utf8ToBase64(payload),
    signedAt,
  };
}
