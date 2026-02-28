import { useFonts, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./global.css";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

type WsReq = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type WsRes = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string } | string;
};

type WsEvent = {
  type: "event";
  event: string;
  payload?: unknown;
};

type SessionItem = {
  key: string;
  label?: string;
  updatedAt?: string | number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  runId?: string;
  pending?: boolean;
};

type DeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
  deviceToken?: string;
};

type MarkdownBlock =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "code";
      language?: string;
      code: string;
    };

const STORAGE_KEY = "openpocket.poc.device.identity";
const INITIAL_STATUS: ConnectionStatus = "disconnected";
const B64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type AppGlobals = typeof globalThis & {
  crypto?: {
    randomUUID?: () => string;
    getRandomValues?: (arr: Uint8Array) => Uint8Array;
    subtle?: {
      importKey: (...args: unknown[]) => Promise<unknown>;
      sign: (...args: unknown[]) => Promise<ArrayBuffer>;
      generateKey: (...args: unknown[]) => Promise<{
        publicKey: unknown;
        privateKey: unknown;
      }>;
      exportKey: (...args: unknown[]) => Promise<unknown>;
    };
  };
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
  localStorage?: {
    setItem: (key: string, value: string) => void;
    getItem: (key: string) => string | null;
  };
  navigator?: {
    clipboard?: {
      writeText: (value: string) => Promise<void>;
    };
  };
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") {
    return null;
  }
  return v as Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const appGlobals = globalThis as AppGlobals;
  if (typeof appGlobals.crypto?.randomUUID === "function") {
    return `${prefix}_${appGlobals.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const appGlobals = globalThis as AppGlobals;
  if (typeof appGlobals.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return appGlobals.btoa(binary);
  }

  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;

    const triple = (a << 16) | (b << 8) | c;
    out += B64_TABLE[(triple >> 18) & 63];
    out += B64_TABLE[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? B64_TABLE[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64_TABLE[triple & 63] : "=";
  }

  return out;
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes);
}

function randomB64(size: number): string {
  const appGlobals = globalThis as AppGlobals;
  const bytes = new Uint8Array(size);
  if (typeof appGlobals.crypto?.getRandomValues === "function") {
    appGlobals.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 255);
    }
  }
  return bytesToBase64(bytes);
}

function parseMarkdownBlocks(value: string): MarkdownBlock[] {
  const lines = value.split("\n");
  const blocks: MarkdownBlock[] = [];
  let textBuf: string[] = [];
  let codeBuf: string[] | null = null;
  let language = "";

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ kind: "text", text: textBuf.join("\n") });
      textBuf = [];
    }
  };

  const flushCode = () => {
    if (codeBuf !== null) {
      blocks.push({
        kind: "code",
        language: language || undefined,
        code: codeBuf.join("\n"),
      });
      codeBuf = null;
      language = "";
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (codeBuf === null) {
        flushText();
        codeBuf = [];
        language = line.slice(3).trim();
      } else {
        flushCode();
      }
      continue;
    }

    if (codeBuf !== null) {
      codeBuf.push(line);
    } else {
      textBuf.push(line);
    }
  }

  flushText();
  flushCode();

  if (blocks.length === 0) {
    return [{ kind: "text", text: value }];
  }

  return blocks;
}

function extractMessageText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (!input) {
    return "";
  }

  if (Array.isArray(input)) {
    return input.map(extractMessageText).filter(Boolean).join("\n");
  }

  const rec = asRecord(input);
  if (!rec) {
    return "";
  }

  const candidates = [
    rec.text,
    rec.delta,
    rec.content,
    rec.message,
    rec.output,
    rec.value,
    rec.parts,
    rec.blocks,
    rec.data,
  ];

  const texts = candidates.map(extractMessageText).filter(Boolean);
  return texts.join("\n");
}

function extractSessionItems(payload: unknown): SessionItem[] {
  const root = asRecord(payload);
  const list = Array.isArray(root?.sessions)
    ? root?.sessions
    : Array.isArray(root?.items)
      ? root?.items
      : Array.isArray(payload)
        ? payload
        : [];

  return list
    .map((raw) => {
      const item = asRecord(raw);
      if (!item || typeof item.key !== "string") {
        return null;
      }
      return {
        key: item.key,
        label: typeof item.label === "string" ? item.label : undefined,
        updatedAt:
          typeof item.updatedAt === "string" || typeof item.updatedAt === "number"
            ? item.updatedAt
            : undefined,
      } satisfies SessionItem;
    })
    .filter((item): item is SessionItem => item !== null);
}

function extractHistoryMessages(payload: unknown): ChatMessage[] {
  const root = asRecord(payload);
  const list = Array.isArray(root?.messages)
    ? root?.messages
    : Array.isArray(payload)
      ? payload
      : [];

  return list
    .map((raw, idx) => {
      const item = asRecord(raw);
      if (!item) {
        return null;
      }

      const role =
        item.role === "assistant" || item.role === "system" || item.role === "tool"
          ? item.role
          : "user";

      const messageText = extractMessageText(item);
      if (!messageText) {
        return null;
      }

      return {
        id: typeof item.id === "string" ? item.id : `hist_${idx}_${Date.now()}`,
        role,
        text: messageText,
        runId: typeof item.runId === "string" ? item.runId : undefined,
      } satisfies ChatMessage;
    })
    .filter((item): item is ChatMessage => item !== null);
}

function saveIdentity(identity: DeviceIdentity) {
  const appGlobals = globalThis as AppGlobals;
  if (!appGlobals.localStorage) {
    return;
  }
  appGlobals.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

function loadIdentity(): DeviceIdentity | null {
  const appGlobals = globalThis as AppGlobals;
  if (!appGlobals.localStorage) {
    return null;
  }

  const raw = appGlobals.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const rec = asRecord(parsed);
    if (!rec) {
      return null;
    }

    if (
      typeof rec.deviceId !== "string" ||
      typeof rec.publicKey !== "string" ||
      typeof rec.privateKey !== "string"
    ) {
      return null;
    }

    return {
      deviceId: rec.deviceId,
      publicKey: rec.publicKey,
      privateKey: rec.privateKey,
      deviceToken: typeof rec.deviceToken === "string" ? rec.deviceToken : undefined,
    };
  } catch {
    return null;
  }
}

async function makeSignature(identity: DeviceIdentity, nonce: string): Promise<string> {
  const appGlobals = globalThis as AppGlobals;
  const payload = `${identity.deviceId}:${nonce}:${nowIso()}`;

  if (
    appGlobals.crypto?.subtle &&
    typeof TextEncoder !== "undefined" &&
    identity.privateKey.startsWith("jwk:")
  ) {
    try {
      const jwk = JSON.parse(identity.privateKey.slice(4));
      const key = await appGlobals.crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, [
        "sign",
      ]);
      const binary = await appGlobals.crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(payload));
      return bytesToBase64(new Uint8Array(binary));
    } catch {
      // fall through to PoC fallback
    }
  }

  return utf8ToBase64(payload);
}

async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  const appGlobals = globalThis as AppGlobals;
  const existing = loadIdentity();
  if (existing) {
    return existing;
  }

  if (appGlobals.crypto?.subtle) {
    try {
      const pair = await appGlobals.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
      const publicJwk = await appGlobals.crypto.subtle.exportKey("jwk", pair.publicKey);
      const privateJwk = await appGlobals.crypto.subtle.exportKey("jwk", pair.privateKey);

      const identity: DeviceIdentity = {
        deviceId: makeId("device"),
        publicKey: `jwk:${JSON.stringify(publicJwk)}`,
        privateKey: `jwk:${JSON.stringify(privateJwk)}`,
      };

      saveIdentity(identity);
      return identity;
    } catch {
      // continue with random fallback
    }
  }

  const identity: DeviceIdentity = {
    deviceId: makeId("device"),
    publicKey: `raw:${randomB64(32)}`,
    privateKey: `raw:${randomB64(64)}`,
  };

  saveIdentity(identity);
  return identity;
}

async function copyText(content: string): Promise<boolean> {
  const appGlobals = globalThis as AppGlobals;
  try {
    if (appGlobals.navigator?.clipboard?.writeText) {
      await appGlobals.navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function MarkdownMessage({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async (value: string) => {
    const ok = await copyText(value);
    setCopied(ok);
    if (ok) {
      setTimeout(() => setCopied(false), 1000);
    }
  }, []);

  return (
    <View style={styles.markdownRoot}>
      {blocks.map((block, idx) => {
        if (block.kind === "text") {
          return (
            <Text key={`t_${idx}`} style={styles.messageText}>
              {block.text}
            </Text>
          );
        }

        return (
          <View key={`c_${idx}`} style={styles.codeBlock}>
            <View style={styles.codeHeader}>
              <Text style={styles.codeLang}>{block.language ?? "code"}</Text>
              <Pressable style={styles.copyButton} onPress={() => void onCopy(block.code)}>
                <Text style={styles.copyButtonText}>{copied ? "Copied" : "Copy"}</Text>
              </Pressable>
            </View>
            <ScrollView horizontal>
              <Text selectable style={styles.codeText}>
                {block.code}
              </Text>
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reqIdRef = useRef(0);
  const pendingRef = useRef(new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>());
  const streamByRunRef = useRef(new Map<string, string>());

  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>(INITIAL_STATUS);
  const [statusMessage, setStatusMessage] = useState("Not connected");
  const [logs, setLogs] = useState<string[]>([]);

  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [activeRunId, setActiveRunId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastIdempotencyKey, setLastIdempotencyKey] = useState("");

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 50));
  }, []);

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const call = useCallback(
    (method: string, params?: unknown) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("Socket is not connected"));
      }

      reqIdRef.current += 1;
      const id = `${Date.now()}_${reqIdRef.current}`;
      const req: WsReq = {
        type: "req",
        id,
        method,
        params,
      };

      return new Promise<unknown>((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
        wsRef.current?.send(JSON.stringify(req));
      });
    },
    [],
  );

  const refreshSessions = useCallback(async () => {
    try {
      const payload = await call("sessions.list", {
        limit: 50,
        includeGlobal: true,
        includeUnknown: true,
      });
      const items = extractSessionItems(payload);
      setSessions(items);
      appendLog(`sessions.list -> ${items.length} sessions`);
      if (!selectedSessionKey && items.length > 0) {
        setSelectedSessionKey(items[0].key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`sessions.list failed: ${message}`);
    }
  }, [appendLog, call, selectedSessionKey]);

  const loadHistory = useCallback(
    async (sessionKey: string) => {
      if (!sessionKey) {
        return;
      }

      try {
        const payload = await call("chat.history", {
          sessionKey,
          limit: 80,
        });
        const history = extractHistoryMessages(payload);
        setMessages(history);
        setStreamingText("");
        appendLog(`chat.history(${sessionKey}) -> ${history.length} messages`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog(`chat.history failed: ${message}`);
      }
    },
    [appendLog, call],
  );

  const performConnect = useCallback(async () => {
    if (!gatewayUrl.trim()) {
      setStatus("error");
      setStatusMessage("Gateway URL is required");
      return;
    }

    closeSocket();
    setStatus("connecting");
    setStatusMessage("Connecting...");
    setMessages([]);
    setStreamingText("");
    setSessions([]);

    const socket = new WebSocket(gatewayUrl.trim());
    wsRef.current = socket;

    socket.onopen = () => {
      appendLog("WS opened");
      setStatusMessage("WS open; waiting for connect.challenge");
    };

    socket.onerror = () => {
      setStatus("error");
      setStatusMessage("WebSocket error");
      appendLog("WebSocket error");
    };

    socket.onclose = () => {
      setStatus((prev) => (prev === "connected" ? "reconnecting" : prev));
      setStatusMessage("Socket closed");
      appendLog("WS closed");
      for (const entry of pendingRef.current.values()) {
        entry.reject(new Error("socket closed"));
      }
      pendingRef.current.clear();
    };

    socket.onmessage = (ev) => {
      let packet: WsRes | WsEvent;
      try {
        packet = JSON.parse(String(ev.data));
      } catch {
        appendLog(`Invalid message: ${String(ev.data).slice(0, 120)}`);
        return;
      }

      if (packet.type === "res") {
        const pending = pendingRef.current.get(packet.id);
        if (!pending) {
          return;
        }
        pendingRef.current.delete(packet.id);

        if (packet.ok) {
          pending.resolve(packet.payload);
        } else {
          const code = typeof packet.error === "object" ? packet.error?.code : undefined;
          const message =
            typeof packet.error === "object"
              ? packet.error?.message ?? "request failed"
              : packet.error ?? "request failed";
          const detail = code ? `${code}: ${message}` : message;
          pending.reject(new Error(detail));
          if (code === "PAIRING_REQUIRED") {
            setStatus("error");
            setStatusMessage(`PAIRING_REQUIRED: ${message}`);
          }
        }
        return;
      }

      if (packet.type !== "event") {
        return;
      }

      if (packet.event === "connect.challenge") {
        void (async () => {
          try {
            const eventPayload = asRecord(packet.payload);
            const nonce = typeof eventPayload?.nonce === "string" ? eventPayload.nonce : "";
            const signedAt = nowIso();
            const ident = await getOrCreateIdentity();
            setIdentity(ident);

            const signature = await makeSignature(ident, nonce);

            const hello = await call("connect", {
              minProtocol: 3,
              maxProtocol: 3,
              role: "operator",
              scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
              client: {
                id: "openpocket-poc",
                version: "0.1.0",
                platform: Platform.OS,
                mode: "mobile",
                instanceId: makeId("instance"),
              },
              auth: {
                token: token.trim() || undefined,
                password: password.trim() || undefined,
                deviceToken: ident.deviceToken,
              },
              device: {
                id: ident.deviceId,
                publicKey: ident.publicKey,
                nonce,
                signedAt,
                signature,
              },
            });

            const helloRec = asRecord(hello);
            const authRec = asRecord(helloRec?.auth);
            if (typeof authRec?.deviceToken === "string") {
              const nextIdentity: DeviceIdentity = { ...ident, deviceToken: authRec.deviceToken };
              setIdentity(nextIdentity);
              saveIdentity(nextIdentity);
              appendLog("Saved auth.deviceToken from hello-ok");
            }

            setStatus("connected");
            setStatusMessage("connected (hello-ok)");
            appendLog("connect -> hello-ok");
            await refreshSessions();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus("error");
            setStatusMessage(`connect failed: ${message}`);
            appendLog(`connect failed: ${message}`);
          }
        })();
      }

      if (packet.event === "chat") {
        const payload = asRecord(packet.payload);
        const sessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey : "";
        if (selectedSessionKey && sessionKey && sessionKey !== selectedSessionKey) {
          return;
        }

        const state = typeof payload?.state === "string" ? payload.state : "";
        const runId = typeof payload?.runId === "string" ? payload.runId : "";
        const text = extractMessageText(payload?.message);

        if (runId) {
          setActiveRunId(runId);
        }

        if (state === "delta") {
          const current = runId ? streamByRunRef.current.get(runId) ?? "" : streamingText;
          const next = text || extractMessageText(payload?.delta);
          const merged = `${current}${next}`;
          if (runId) {
            streamByRunRef.current.set(runId, merged);
          }
          setStreamingText(merged);
          return;
        }

        if (state === "final") {
          const finalText =
            text ||
            (runId ? streamByRunRef.current.get(runId) : undefined) ||
            extractMessageText(payload?.final) ||
            "";
          if (finalText) {
            setMessages((prev) => [
              ...prev,
              {
                id: makeId("msg"),
                role: "assistant",
                text: finalText,
                runId: runId || undefined,
              },
            ]);
          }
          if (runId) {
            streamByRunRef.current.delete(runId);
          }
          setStreamingText("");
          setActiveRunId("");
          setIsSending(false);
          return;
        }

        if (state === "aborted") {
          const abortedText = runId ? streamByRunRef.current.get(runId) : streamingText;
          if (abortedText) {
            setMessages((prev) => [
              ...prev,
              {
                id: makeId("msg"),
                role: "assistant",
                text: `${abortedText}\n\n[aborted]`,
                runId: runId || undefined,
              },
            ]);
          }
          if (runId) {
            streamByRunRef.current.delete(runId);
          }
          setStreamingText("");
          setActiveRunId("");
          setIsSending(false);
          return;
        }

        if (state === "error") {
          const message = typeof payload?.errorMessage === "string" ? payload.errorMessage : "stream error";
          appendLog(`chat stream error: ${message}`);
          setStatusMessage(`chat stream error: ${message}`);
          setStreamingText("");
          setActiveRunId("");
          setIsSending(false);
        }
      }
    };
  }, [appendLog, call, closeSocket, gatewayUrl, password, refreshSessions, selectedSessionKey, streamingText, token]);

  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, [closeSocket]);

  useEffect(() => {
    if (selectedSessionKey) {
      void loadHistory(selectedSessionKey);
    }
  }, [loadHistory, selectedSessionKey]);

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || !selectedSessionKey) {
      return;
    }

    const text = chatInput.trim();
    const idempotencyKey = makeId("idem");
    setLastIdempotencyKey(idempotencyKey);

    setMessages((prev) => [
      ...prev,
      {
        id: makeId("msg"),
        role: "user",
        text,
        pending: false,
      },
    ]);

    setChatInput("");
    setIsSending(true);

    try {
      await call("chat.send", {
        sessionKey: selectedSessionKey,
        message: text,
        deliver: false,
        idempotencyKey,
      });
      appendLog(`chat.send ok (idempotencyKey=${idempotencyKey})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`chat.send failed: ${message}`);
      setStatusMessage(`chat.send failed: ${message}`);
      setIsSending(false);
    }
  }, [appendLog, call, chatInput, selectedSessionKey]);

  const abortChat = useCallback(async () => {
    if (!selectedSessionKey) {
      return;
    }

    try {
      await call("chat.abort", {
        sessionKey: selectedSessionKey,
        runId: activeRunId || undefined,
      });
      appendLog(`chat.abort ok (${activeRunId || "no-run-id"})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`chat.abort failed: ${message}`);
      setStatusMessage(`chat.abort failed: ${message}`);
    }
  }, [activeRunId, appendLog, call, selectedSessionKey]);

  const statusColor =
    status === "connected"
      ? "#16a34a"
      : status === "error"
        ? "#dc2626"
        : status === "reconnecting"
          ? "#d97706"
          : "#0f172a";

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="auto" />

      <View style={styles.header}>
        <Text style={styles.title}>openpocket PoC</Text>
        <Text style={[styles.statusText, { color: statusColor }]}>status: {status}</Text>
        <Text style={styles.statusMessage}>{statusMessage}</Text>
      </View>

      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gateway connect</Text>
          <TextInput
            placeholder="wss://gateway.example.ts.net/"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={gatewayUrl}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setGatewayUrl}
          />
          <TextInput
            placeholder="token (optional if deviceToken exists)"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={token}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setToken}
          />
          <TextInput
            placeholder="password (optional)"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={password}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPassword}
          />

          <Pressable style={styles.primaryButton} onPress={() => void performConnect()}>
            <Text style={styles.primaryButtonText}>Connect (challenge/hello)</Text>
          </Pressable>

          {identity ? (
            <Text style={styles.metaText}>
              device: {identity.deviceId}
              {identity.deviceToken ? " (deviceToken saved)" : ""}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Sessions</Text>
            <Pressable style={styles.secondaryButton} onPress={() => void refreshSessions()}>
              <Text style={styles.secondaryButtonText}>Reload</Text>
            </Pressable>
          </View>

          <FlatList
            data={sessions}
            keyExtractor={(item) => item.key}
            style={styles.sessionsList}
            renderItem={({ item }) => {
              const active = item.key === selectedSessionKey;
              return (
                <Pressable
                  style={[styles.sessionRow, active ? styles.sessionRowActive : null]}
                  onPress={() => setSelectedSessionKey(item.key)}
                >
                  <Text style={styles.sessionKey}>{item.label || item.key}</Text>
                  <Text style={styles.sessionMeta}>{item.updatedAt ? String(item.updatedAt) : "-"}</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.metaText}>No sessions yet</Text>}
            scrollEnabled={false}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Chat ({selectedSessionKey || "select session"})</Text>
            <View style={styles.rowGap8}>
              <Pressable style={styles.secondaryButton} onPress={() => void loadHistory(selectedSessionKey)}>
                <Text style={styles.secondaryButtonText}>History</Text>
              </Pressable>
              <Pressable style={styles.abortButton} onPress={() => void abortChat()}>
                <Text style={styles.abortButtonText}>Abort</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.chatList}>
            {messages.map((message) => (
              <View key={message.id} style={styles.chatItem}>
                <Text style={styles.chatRole}>{message.role}</Text>
                <MarkdownMessage text={message.text} />
              </View>
            ))}

            {streamingText ? (
              <View style={styles.chatItemStreaming}>
                <Text style={styles.chatRole}>assistant (streaming)</Text>
                <MarkdownMessage text={streamingText} />
              </View>
            ) : null}

            {isSending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator size="small" color="#0f172a" />
                <Text style={styles.metaText}>waiting stream... {lastIdempotencyKey}</Text>
              </View>
            ) : null}
          </View>

          <TextInput
            placeholder="Type message"
            placeholderTextColor="#94a3b8"
            multiline
            value={chatInput}
            onChangeText={setChatInput}
            style={styles.chatInput}
          />

          <Pressable style={styles.primaryButton} onPress={() => void sendChat()}>
            <Text style={styles.primaryButtonText}>Send (chat.send + idempotencyKey)</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Logs</Text>
          <View style={styles.logsBox}>
            {logs.length === 0 ? <Text style={styles.metaText}>No logs yet</Text> : null}
            {logs.map((line, idx) => (
              <Text key={`log_${idx}`} style={styles.logLine}>
                {line}
              </Text>
            ))}
          </View>
          {Platform.OS !== "web" ? (
            <Text style={styles.metaText}>Code block copy button currently uses web clipboard API only.</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  page: {
    flex: 1,
  },
  pageContent: {
    padding: 16,
    gap: 12,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    color: "#020617",
  },
  statusText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
  },
  statusMessage: {
    marginTop: 4,
    color: "#334155",
    fontSize: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    color: "#0f172a",
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#0f172a",
    fontSize: 14,
    backgroundColor: "#ffffff",
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#94a3b8",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
  },
  abortButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dc2626",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  abortButtonText: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "700",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowGap8: {
    flexDirection: "row",
    gap: 8,
  },
  sessionsList: {
    gap: 6,
  },
  sessionRow: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    backgroundColor: "#ffffff",
  },
  sessionRowActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  sessionKey: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 13,
  },
  sessionMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
  },
  chatList: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 8,
    maxHeight: 380,
    gap: 6,
  },
  chatItem: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#ffffff",
    gap: 4,
  },
  chatItemStreaming: {
    borderWidth: 1,
    borderColor: "#fdba74",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fffbeb",
    gap: 4,
  },
  chatRole: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  markdownRoot: {
    gap: 8,
  },
  messageText: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 20,
  },
  codeBlock: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#0b1220",
  },
  codeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  codeLang: {
    color: "#cbd5e1",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  copyButton: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyButtonText: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "700",
  },
  codeText: {
    color: "#e2e8f0",
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
    fontSize: 12,
    lineHeight: 18,
    padding: 8,
  },
  sendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#0f172a",
    textAlignVertical: "top",
  },
  logsBox: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 8,
    gap: 4,
  },
  logLine: {
    color: "#334155",
    fontSize: 11,
  },
  metaText: {
    color: "#64748b",
    fontSize: 12,
  },
});
