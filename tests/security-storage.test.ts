import { describe, expect, it } from "vitest";

import { bytesToBase64Url } from "../src/core/security/base64url";
import {
  clearGatewayConnectionSecrets,
  loadGatewayConnectionSecrets,
  saveGatewayConnectionSecrets,
} from "../src/core/security/connectionSecrets";
import {
  loadOrCreateDeviceIdentity,
  persistDeviceToken,
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

describe("security storage", () => {
  // 接続情報を保存・読込・削除できること
  it("saves, loads, and clears gateway connection secrets", async () => {
    const store = new MemoryStore();

    await saveGatewayConnectionSecrets(store, {
      gatewayUrl: " wss://example.ts.net/ ",
      token: "  test-token  ",
    });

    await expect(loadGatewayConnectionSecrets(store)).resolves.toEqual({
      gatewayUrl: "wss://example.ts.net/",
      token: "test-token",
    });

    await clearGatewayConnectionSecrets(store);

    await expect(loadGatewayConnectionSecrets(store)).resolves.toEqual({
      gatewayUrl: "",
      token: "",
    });
  });

  // 端末識別情報の作成後に再読み込み時は同一IDが維持されること
  it("creates and reloads stable device identity", async () => {
    const store = new MemoryStore();
    const seed = new Uint8Array(32).fill(7);
    const randomBytes = () => seed;

    const first = await loadOrCreateDeviceIdentity(store, randomBytes);
    const second = await loadOrCreateDeviceIdentity(store, () => new Uint8Array(32).fill(8));

    expect(first.source).toBe("created");
    expect(second.source).toBe("existing");
    expect(second.identity.deviceId).toBe(first.identity.deviceId);
  });

  // legacy privateKey 形式でも seed32 を真実として修復できること
  it("recovers from legacy privateKey records and preserves device token", async () => {
    const store = new MemoryStore();
    const seed = new Uint8Array(32).fill(9);
    const seedB64 = bytesToBase64Url(seed);

    await store.setItem(
      "openpocket.gateway.device.identity.v1",
      JSON.stringify({
        privateKey: seedB64,
        publicKey: "broken-public-key",
        deviceId: "broken-device-id",
        deviceToken: "device-token-1",
      }),
    );

    const loaded = await loadOrCreateDeviceIdentity(store, () => new Uint8Array(32).fill(1));

    expect(loaded.source).toBe("recovered");
    expect(loaded.identity.seed32).toBe(seedB64);
    expect(loaded.identity.deviceToken).toBe("device-token-1");

    const persisted = await persistDeviceToken(store, loaded.identity, "device-token-2");
    expect(persisted.deviceToken).toBe("device-token-2");
  });
});
