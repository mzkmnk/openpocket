import { sha256 as sha256Hex } from "js-sha256";
import nacl from "tweetnacl";

import { base64UrlToBytes, bytesToBase64Url } from "./base64url";
import type { SecureStoreAdapter } from "./secureStore";

const DEVICE_IDENTITY_KEY = "openpocket.gateway.device.identity.v1";

/**
 * Stable device identity used for Gateway device-auth.
 * Gateway の device-auth で使う端末識別情報です。
 */
export type DeviceIdentity = {
  /**
   * Seed private key (32 bytes, base64url). Source of truth.
   * seed 形式の秘密鍵（32bytes, base64url）。真実のソースです。
   */
  seed32: string;
  /**
   * Device public key (32 bytes, base64url).
   * 端末公開鍵（32bytes, base64url）。
   */
  publicKey: string;
  /**
   * Device identifier (`sha256(publicKeyRawBytes)` hex).
   * 端末識別子（`sha256(publicKeyRawBytes)` の hex）。
   */
  deviceId: string;
  /**
   * Optional issued device token.
   * 発行済み device token（任意）。
   */
  deviceToken?: string;
};

/**
 * Indicates how a device identity load was resolved.
 * 端末識別情報の読み込み結果の種別です。
 */
export type DeviceIdentityLoadResult = {
  /**
   * Loaded or newly generated identity.
   * 読み込みまたは新規生成された識別情報。
   */
  identity: DeviceIdentity;
  /**
   * `existing`: valid record reused.
   * `recovered`: invalid/migrated record repaired.
   * `created`: no record existed.
   * `existing`: 有効レコードを再利用。
   * `recovered`: 破損/移行レコードを修復。
   * `created`: レコード未存在。
   */
  source: "existing" | "recovered" | "created";
};

function deriveIdentityFromSeed(seed32Base64Url: string, deviceToken?: string): DeviceIdentity {
  const seed32 = base64UrlToBytes(seed32Base64Url);
  if (seed32.length !== 32) {
    throw new Error("seed32 must be 32 bytes");
  }

  const keyPair = nacl.sign.keyPair.fromSeed(seed32);
  const publicKey = bytesToBase64Url(keyPair.publicKey);
  const deviceId = sha256Hex(keyPair.publicKey);

  return {
    seed32: seed32Base64Url,
    publicKey,
    deviceId,
    deviceToken,
  };
}

async function saveIdentity(store: SecureStoreAdapter, identity: DeviceIdentity): Promise<void> {
  await store.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(identity));
}

function parseLegacyIdentity(raw: unknown): { seed32: string; deviceToken?: string } | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.seed32 === "string") {
    return {
      seed32: record.seed32,
      deviceToken: typeof record.deviceToken === "string" ? record.deviceToken : undefined,
    };
  }
  if (typeof record.privateKey === "string") {
    return {
      seed32: record.privateKey,
      deviceToken: typeof record.deviceToken === "string" ? record.deviceToken : undefined,
    };
  }
  return null;
}

/**
 * Loads device identity from secure storage or creates/repairs it.
 * セキュアストレージから端末識別情報を読み込み、必要なら生成/修復します。
 *
 * @param store - Secure storage adapter.
 *                セキュアストレージアダプタ。
 * @param randomBytes - CSPRNG provider returning `length` bytes.
 *                      `length` バイトを返す CSPRNG 関数。
 * @returns Load result with source information.
 *          読み込み結果（生成元情報を含む）。
 */
export async function loadOrCreateDeviceIdentity(
  store: SecureStoreAdapter,
  randomBytes: (length: number) => Uint8Array,
): Promise<DeviceIdentityLoadResult> {
  const raw = await store.getItem(DEVICE_IDENTITY_KEY);
  if (!raw) {
    const seed32 = bytesToBase64Url(randomBytes(32));
    const identity = deriveIdentityFromSeed(seed32);
    await saveIdentity(store, identity);
    return { identity, source: "created" };
  }

  try {
    const parsed = parseLegacyIdentity(JSON.parse(raw));
    if (!parsed) {
      throw new Error("invalid stored identity");
    }

    const identity = deriveIdentityFromSeed(parsed.seed32, parsed.deviceToken);
    const original = JSON.parse(raw) as Record<string, unknown>;
    const isMismatch =
      original.deviceId !== identity.deviceId ||
      original.publicKey !== identity.publicKey ||
      original.seed32 !== identity.seed32;

    if (isMismatch || typeof original.seed32 !== "string") {
      await saveIdentity(store, identity);
      return { identity, source: "recovered" };
    }
    return { identity, source: "existing" };
  } catch {
    const seed32 = bytesToBase64Url(randomBytes(32));
    const identity = deriveIdentityFromSeed(seed32);
    await saveIdentity(store, identity);
    return { identity, source: "recovered" };
  }
}

/**
 * Persists an issued device token to the stored identity.
 * 発行された device token を保存済み識別情報へ反映します。
 *
 * @param store - Secure storage adapter.
 *                セキュアストレージアダプタ。
 * @param identity - Current device identity.
 *                   現在の端末識別情報。
 * @param deviceToken - Issued device token.
 *                      発行された device token。
 * @returns Updated identity.
 *          更新後の識別情報。
 */
export async function persistDeviceToken(
  store: SecureStoreAdapter,
  identity: DeviceIdentity,
  deviceToken: string,
): Promise<DeviceIdentity> {
  const next: DeviceIdentity = {
    ...identity,
    deviceToken,
  };
  await saveIdentity(store, next);
  return next;
}
