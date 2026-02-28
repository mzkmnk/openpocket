import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";

import { base64UrlToBytes } from "../src/core/security/base64url";
import {
  buildDeviceAuthSignaturePayloadV2,
  buildGatewayOperatorConnectParams,
  type GatewayOperatorConnectParams,
} from "../src/core/security/deviceAuth";
import {
  loadOrCreateDeviceIdentity,
  type DeviceIdentity,
} from "../src/core/security/deviceIdentity";
import type { SecureStoreAdapter } from "../src/core/security/secureStore";

class MemoryStore implements SecureStoreAdapter {
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

function verifyConnectSignature(
  identity: DeviceIdentity,
  params: GatewayOperatorConnectParams,
): boolean {
  const payload = buildDeviceAuthSignaturePayloadV2({
    deviceId: params.device.id,
    clientId: params.client.id,
    clientMode: params.client.mode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs: params.device.signedAt,
    token: params.auth.token,
    nonce: params.device.nonce,
  });

  return nacl.sign.detached.verify(
    new TextEncoder().encode(payload),
    base64UrlToBytes(params.device.signature),
    base64UrlToBytes(identity.publicKey),
  );
}

describe("device auth connect params", () => {
  // connect 用の device-auth 署名付きパラメータを正しく生成できること
  it("builds signed operator connect params", async () => {
    const store = new MemoryStore();
    const loaded = await loadOrCreateDeviceIdentity(store, () => new Uint8Array(32).fill(7));

    const params = buildGatewayOperatorConnectParams({
      challengePayload: { nonce: "nonce-1" },
      identity: loaded.identity,
      token: " gateway-token ",
      now: () => 1_700_000_000_000,
    });

    expect(params.minProtocol).toBe(3);
    expect(params.maxProtocol).toBe(3);
    expect(params.client.id).toBe("openclaw-control-ui");
    expect(params.client.mode).toBe("webchat");
    expect(params.auth.token).toBe("gateway-token");
    expect(params.device.id).toBe(loaded.identity.deviceId);
    expect(params.device.signedAt).toBe(1_700_000_000_000);
    expect(verifyConnectSignature(loaded.identity, params)).toBe(true);
  });

  // deviceToken が保存済みなら auth.token と署名payloadで優先使用すること
  it("prefers stored deviceToken over manually entered token", async () => {
    const store = new MemoryStore();
    const loaded = await loadOrCreateDeviceIdentity(store, () => new Uint8Array(32).fill(8));
    const withDeviceToken: DeviceIdentity = {
      ...loaded.identity,
      deviceToken: "  device-token-1  ",
    };

    const params = buildGatewayOperatorConnectParams({
      challengePayload: { nonce: "nonce-2" },
      identity: withDeviceToken,
      token: "gateway-token",
      now: () => 1_710_000_000_000,
    });

    expect(params.auth.token).toBe("device-token-1");
    expect(verifyConnectSignature(withDeviceToken, params)).toBe(true);
  });

  // nonce がない challenge payload は connect パラメータ生成時にエラーとなること
  it("throws when challenge payload does not include nonce", async () => {
    const store = new MemoryStore();
    const loaded = await loadOrCreateDeviceIdentity(store, () => new Uint8Array(32).fill(9));

    expect(() =>
      buildGatewayOperatorConnectParams({
        challengePayload: { ts: Date.now() },
        identity: loaded.identity,
        token: "gateway-token",
      }),
    ).toThrow("nonce");
  });
});
