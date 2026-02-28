export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export type WsReq = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type WsRes = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string } | string;
};

export type WsEvent = {
  type: "event";
  event: string;
  payload?: unknown;
};

export type SessionItem = {
  key: string;
  label?: string;
  updatedAt?: string | number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  runId?: string;
};

export type DeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
  deviceToken?: string;
};

export type MarkdownBlock =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "code";
      language?: string;
      code: string;
    };
