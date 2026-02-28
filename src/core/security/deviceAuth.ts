import nacl from "tweetnacl";

import { base64UrlToBytes, bytesToBase64Url } from "./base64url";
import type { DeviceIdentity } from "./deviceIdentity";

const DEFAULT_PROTOCOL_VERSION = 3;
const DEFAULT_ROLE = "operator";
const DEFAULT_SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"] as const;
const DEFAULT_CLIENT_ID = "openclaw-control-ui";
const DEFAULT_CLIENT_MODE = "webchat";
const DEFAULT_CLIENT_VERSION = "openpocket/0.0.1";
const DEFAULT_CLIENT_PLATFORM = "macos";
const DEFAULT_LOCALE = "ja-JP";
const DEFAULT_USER_AGENT = "openpocket/0.0.1";

/**
 * Signature payload input for OpenClaw Gateway device-auth v2.
 * OpenClaw Gateway の device-auth v2 用署名 payload 入力です。
 */
export type DeviceAuthSignaturePayloadV2Input = {
  /**
   * Stable device identifier.
   * 安定した端末識別子です。
   */
  deviceId: string;
  /**
   * Gateway client identifier.
   * Gateway クライアント識別子です。
   */
  clientId: string;
  /**
   * Gateway client mode.
   * Gateway クライアントモードです。
   */
  clientMode: string;
  /**
   * Gateway role name.
   * Gateway ロール名です。
   */
  role: string;
  /**
   * Requested operator scopes.
   * 要求する operator scope です。
   */
  scopes: string[];
  /**
   * Signature timestamp (epoch milliseconds).
   * 署名時刻（epoch ミリ秒）です。
   */
  signedAtMs: number;
  /**
   * Auth token string included in signature payload.
   * 署名 payload に含める認証トークン文字列です。
   */
  token: string;
  /**
   * Challenge nonce.
   * challenge nonce です。
   */
  nonce: string;
};

/**
 * Gateway `connect` params shape for operator device-auth flow.
 * operator の device-auth フローで使う Gateway `connect` params 形状です。
 */
export type GatewayOperatorConnectParams = {
  /**
   * Minimum supported protocol version.
   * 最小対応プロトコルバージョンです。
   */
  minProtocol: number;
  /**
   * Maximum supported protocol version.
   * 最大対応プロトコルバージョンです。
   */
  maxProtocol: number;
  /**
   * Connection role.
   * 接続ロールです。
   */
  role: string;
  /**
   * Requested authorization scopes.
   * 要求する認可スコープです。
   */
  scopes: string[];
  /**
   * Capabilities placeholder.
   * Capabilities のプレースホルダーです。
   */
  caps: unknown[];
  /**
   * Commands placeholder.
   * Commands のプレースホルダーです。
   */
  commands: unknown[];
  /**
   * Permissions placeholder.
   * Permissions のプレースホルダーです。
   */
  permissions: Record<string, unknown>;
  /**
   * Locale hint.
   * ロケールヒントです。
   */
  locale: string;
  /**
   * User agent hint.
   * User-Agent ヒントです。
   */
  userAgent: string;
  /**
   * Client metadata.
   * クライアントメタデータです。
   */
  client: {
    /**
     * Client id.
     * クライアント ID です。
     */
    id: string;
    /**
     * Client version.
     * クライアントバージョンです。
     */
    version: string;
    /**
     * Client platform.
     * クライアントプラットフォームです。
     */
    platform: string;
    /**
     * Client mode.
     * クライアントモードです。
     */
    mode: string;
  };
  /**
   * Authentication parameters.
   * 認証パラメータです。
   */
  auth: {
    /**
     * Authentication token.
     * 認証トークンです。
     */
    token: string;
    /**
     * Optional password.
     * 任意のパスワードです。
     */
    password?: string;
  };
  /**
   * Signed device-auth proof.
   * 署名済み device-auth 証明です。
   */
  device: {
    /**
     * Stable device id.
     * 安定した端末 ID です。
     */
    id: string;
    /**
     * Device public key in base64url.
     * base64url 形式の端末公開鍵です。
     */
    publicKey: string;
    /**
     * Challenge nonce echoed from server.
     * サーバから受け取った challenge nonce です。
     */
    nonce: string;
    /**
     * Signature timestamp.
     * 署名時刻です。
     */
    signedAt: number;
    /**
     * Detached Ed25519 signature (base64url).
     * 分離 Ed25519 署名（base64url）です。
     */
    signature: string;
  };
};

/**
 * Input to build operator `connect` params from challenge payload and identity.
 * challenge payload と識別情報から operator `connect` params を組み立てる入力です。
 */
export type BuildGatewayOperatorConnectParamsInput = {
  /**
   * Raw `connect.challenge` payload.
   * `connect.challenge` の生 payload です。
   */
  challengePayload: unknown;
  /**
   * Stable device identity.
   * 安定した端末識別情報です。
   */
  identity: DeviceIdentity;
  /**
   * User-entered gateway token.
   * ユーザー入力の gateway token です。
   */
  token: string;
  /**
   * Optional password for mixed auth deployments.
   * 認証方式混在環境向けの任意パスワードです。
   */
  password?: string;
  /**
   * Optional scope override.
   * 任意の scope 上書きです。
   */
  scopes?: string[];
  /**
   * Optional client id override.
   * 任意の client id 上書きです。
   */
  clientId?: string;
  /**
   * Optional client mode override.
   * 任意の client mode 上書きです。
   */
  clientMode?: string;
  /**
   * Optional client version override.
   * 任意の client version 上書きです。
   */
  clientVersion?: string;
  /**
   * Optional client platform override.
   * 任意の client platform 上書きです。
   */
  clientPlatform?: string;
  /**
   * Optional locale override.
   * 任意の locale 上書きです。
   */
  locale?: string;
  /**
   * Optional user-agent override.
   * 任意の user-agent 上書きです。
   */
  userAgent?: string;
  /**
   * Optional time provider.
   * 任意の時刻プロバイダです。
   */
  now?: () => number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readChallengeNonce(challengePayload: unknown): string {
  if (!isRecord(challengePayload) || typeof challengePayload.nonce !== "string") {
    throw new Error("connect.challenge payload must include nonce");
  }
  return challengePayload.nonce;
}

/**
 * Builds the Gateway device-auth v2 signature payload.
 * Gateway device-auth v2 の署名 payload を生成します。
 *
 * @param input - v2 payload fields.
 *                v2 payload の各フィールド。
 * @returns Pipe-delimited signature payload string.
 *          パイプ区切りの署名 payload 文字列。
 */
export function buildDeviceAuthSignaturePayloadV2(
  input: DeviceAuthSignaturePayloadV2Input,
): string {
  const scopesCsv = input.scopes.join(",");
  return [
    "v2",
    input.deviceId,
    input.clientId,
    input.clientMode,
    input.role,
    scopesCsv,
    String(input.signedAtMs),
    input.token,
    input.nonce,
  ].join("|");
}

/**
 * Signs a device-auth payload with Ed25519 seed32 key material.
 * Ed25519 seed32 鍵素材で device-auth payload に署名します。
 *
 * @param seed32 - Base64url encoded 32-byte seed private key.
 *                 base64url エンコードされた 32byte の seed 秘密鍵。
 * @param payload - UTF-8 signature payload.
 *                  UTF-8 の署名 payload。
 * @returns Detached Ed25519 signature in base64url.
 *          base64url 形式の分離 Ed25519 署名。
 */
export function signDeviceAuthPayload(seed32: string, payload: string): string {
  const seedBytes = base64UrlToBytes(seed32);
  if (seedBytes.length !== 32) {
    throw new Error("device seed32 must be 32 bytes");
  }

  const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
  const payloadBytes = new TextEncoder().encode(payload);
  const signature = nacl.sign.detached(payloadBytes, keyPair.secretKey);
  return bytesToBase64Url(signature);
}

/**
 * Builds Gateway `connect` params with signed device-auth proof for operators.
 * operator 向けに署名済み device-auth を含む Gateway `connect` params を生成します。
 *
 * @param input - Challenge/auth/identity inputs.
 *                challenge/auth/identity の入力値。
 * @returns Gateway `connect` params ready to send.
 *          送信可能な Gateway `connect` params。
 */
export function buildGatewayOperatorConnectParams(
  input: BuildGatewayOperatorConnectParamsInput,
): GatewayOperatorConnectParams {
  const nonce = readChallengeNonce(input.challengePayload);
  const tokenForAuth = (input.identity.deviceToken ?? input.token).trim();
  if (!tokenForAuth) {
    throw new Error("Gateway token is required (auth.token).");
  }

  const signedAt = (input.now ?? Date.now)();
  const scopes = [...(input.scopes ?? [...DEFAULT_SCOPES])];
  const clientId = input.clientId ?? DEFAULT_CLIENT_ID;
  const clientMode = input.clientMode ?? DEFAULT_CLIENT_MODE;
  const role = DEFAULT_ROLE;

  const signaturePayload = buildDeviceAuthSignaturePayloadV2({
    deviceId: input.identity.deviceId,
    clientId,
    clientMode,
    role,
    scopes,
    signedAtMs: signedAt,
    token: tokenForAuth,
    nonce,
  });
  const signature = signDeviceAuthPayload(input.identity.seed32, signaturePayload);

  return {
    minProtocol: DEFAULT_PROTOCOL_VERSION,
    maxProtocol: DEFAULT_PROTOCOL_VERSION,
    role,
    scopes,
    caps: [],
    commands: [],
    permissions: {},
    locale: input.locale ?? DEFAULT_LOCALE,
    userAgent: input.userAgent ?? DEFAULT_USER_AGENT,
    client: {
      id: clientId,
      version: input.clientVersion ?? DEFAULT_CLIENT_VERSION,
      platform: input.clientPlatform ?? DEFAULT_CLIENT_PLATFORM,
      mode: clientMode,
    },
    auth: {
      token: tokenForAuth,
      password: input.password?.trim() || undefined,
    },
    device: {
      id: input.identity.deviceId,
      publicKey: input.identity.publicKey,
      nonce,
      signedAt,
      signature,
    },
  };
}
