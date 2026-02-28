import { useFonts, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { copyText } from "./src/poc/clipboard";
import { getOrCreateIdentity, makeSignature, persistDeviceToken } from "./src/poc/identity";
import { parseMarkdownBlocks } from "./src/poc/markdown";
import type { ChatMessage, ConnectionStatus, DeviceIdentity, WsEvent, WsReq, WsRes } from "./src/poc/types";
import { asRecord, extractHistoryMessages, extractMessageText, extractSessionItems, makeId } from "./src/poc/utils";

import "./global.css";

const RECONNECT_MS = 2000;
const MAX_LOGS = 80;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

function MarkdownMessage({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const onCopy = useCallback(async (value: string, index: number) => {
    const ok = await copyText(value);
    if (!ok) {
      return;
    }

    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex((prev) => (prev === index ? null : prev));
    }, 1200);
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
              <Pressable style={styles.copyButton} onPress={() => void onCopy(block.code, idx)}>
                <Text style={styles.copyButtonText}>{copiedIndex === idx ? "Copied" : "Copy"}</Text>
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
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const lastConnectArgsRef = useRef<{ gatewayUrl: string; token: string; password: string } | null>(null);
  const streamByRunRef = useRef<Map<string, string>>(new Map());

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [statusMessage, setStatusMessage] = useState("Not connected");
  const [logs, setLogs] = useState<string[]>([]);

  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");

  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [sessions, setSessions] = useState<{ key: string; label?: string; updatedAt?: string | number }[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [activeRunId, setActiveRunId] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastIdempotencyKey, setLastIdempotencyKey] = useState("");

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, MAX_LOGS));
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const rejectAllPending = useCallback((message: string) => {
    for (const entry of pendingRef.current.values()) {
      entry.reject(new Error(message));
    }
    pendingRef.current.clear();
  }, []);

  const closeSocket = useCallback(() => {
    if (!wsRef.current) {
      return;
    }

    wsRef.current.onopen = null;
    wsRef.current.onmessage = null;
    wsRef.current.onerror = null;
    wsRef.current.onclose = null;
    wsRef.current.close();
    wsRef.current = null;
  }, []);

  const call = useCallback((method: string, params?: unknown): Promise<unknown> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Socket is not connected"));
    }

    reqIdRef.current += 1;
    const id = `${Date.now()}_${reqIdRef.current}`;
    const req: WsReq = { type: "req", id, method, params };

    return new Promise<unknown>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      wsRef.current?.send(JSON.stringify(req));
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const payload = await call("sessions.list", {
        limit: 50,
        includeGlobal: true,
        includeUnknown: true,
      });
      const items = extractSessionItems(payload);
      setSessions(items);
      appendLog(`sessions.list -> ${items.length}`);

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
        const payload = await call("chat.history", { sessionKey, limit: 120 });
        const history = extractHistoryMessages(payload);
        setMessages(history);
        setStreamingText("");
        setActiveRunId("");
        appendLog(`chat.history(${sessionKey}) -> ${history.length}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog(`chat.history failed: ${message}`);
      }
    },
    [appendLog, call],
  );

  const connectWithParams = useCallback(
    async (params: { gatewayUrl: string; token: string; password: string }) => {
      const url = params.gatewayUrl.trim();
      const nextToken = params.token.trim();
      const nextPassword = params.password.trim();
      if (!url) {
        setStatus("error");
        setStatusMessage("Gateway URL is required");
        return;
      }

      clearReconnectTimer();
      closeSocket();

      setStatus((prev) => (prev === "connected" ? "reconnecting" : "connecting"));
      setStatusMessage("Opening websocket...");
      shouldReconnectRef.current = true;
      lastConnectArgsRef.current = { gatewayUrl: url, token: nextToken, password: nextPassword };

      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        appendLog("WS opened");
        setStatusMessage("WS open, waiting connect.challenge");
      };

      socket.onerror = () => {
        setStatus("error");
        setStatusMessage("WebSocket error");
        appendLog("WS error");
      };

      socket.onclose = () => {
        wsRef.current = null;
        rejectAllPending("socket closed");

        if (!shouldReconnectRef.current) {
          setStatus("disconnected");
          setStatusMessage("Socket closed");
          appendLog("WS closed");
          return;
        }

        setStatus("reconnecting");
        setStatusMessage(`Socket closed. reconnect in ${Math.floor(RECONNECT_MS / 1000)}s`);
        appendLog("WS closed, scheduling reconnect");

        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => {
          const args = lastConnectArgsRef.current;
          if (!args || !shouldReconnectRef.current) {
            return;
          }
          void connectWithParams(args);
        }, RECONNECT_MS);
      };

      socket.onmessage = (ev) => {
        let packet: WsRes | WsEvent;
        try {
          packet = JSON.parse(String(ev.data)) as WsRes | WsEvent;
        } catch {
          appendLog(`invalid packet: ${String(ev.data).slice(0, 120)}`);
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
            return;
          }

          const code = typeof packet.error === "object" ? packet.error?.code : undefined;
          const message =
            typeof packet.error === "object"
              ? packet.error?.message ?? "request failed"
              : packet.error ?? "request failed";

          const detail = code ? `${code}: ${message}` : String(message);
          pending.reject(new Error(detail));
          if (code === "PAIRING_REQUIRED") {
            setStatus("error");
            setStatusMessage(`PAIRING_REQUIRED: ${message}`);
          }
          return;
        }

        if (packet.type !== "event") {
          return;
        }

        if (packet.event === "connect.challenge") {
          void (async () => {
            try {
              const payload = asRecord(packet.payload);
              const nonce = typeof payload?.nonce === "string" ? payload.nonce : "";
              const identityData = await getOrCreateIdentity();
              setIdentity(identityData);

              const signed = await makeSignature(identityData, nonce);
              const hello = await call("connect", {
                minProtocol: 3,
                maxProtocol: 3,
                role: "operator",
                scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
                client: {
                  id: "cli",
                  version: "openpocket/0.0.1",
                  // NOTE: Gateway protocol validation currently expects
                  // operator clients to use a desktop-like platform string.
                  // For PoC we pin to "macos" to satisfy the schema.
                  platform: "macos",
                  mode: "operator", 
                },
                auth: {
                  token: nextToken || undefined,
                  password: nextPassword || undefined,
                  deviceToken: identityData.deviceToken,
                },
                device: {
                  id: identityData.deviceId,
                  publicKey: identityData.publicKey,
                  nonce,
                  signedAt: signed.signedAt,
                  signature: signed.signature,
                },
              });

              const helloRec = asRecord(hello);
              const authRec = asRecord(helloRec?.auth);
              if (typeof authRec?.deviceToken === "string") {
                const nextIdentity = await persistDeviceToken(identityData, authRec.deviceToken);
                setIdentity(nextIdentity);
                appendLog("auth.deviceToken saved");
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
            const deltaText = text || extractMessageText(payload?.delta);
            const merged = `${current}${deltaText}`;
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
    },
    [appendLog, call, clearReconnectTimer, closeSocket, refreshSessions, rejectAllPending, selectedSessionKey, streamingText],
  );

  const performConnect = useCallback(async () => {
    setMessages([]);
    setStreamingText("");
    setSessions([]);
    setSelectedSessionKey("");
    setActiveRunId("");
    await connectWithParams({ gatewayUrl, token, password });
  }, [connectWithParams, gatewayUrl, password, token]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    closeSocket();
    rejectAllPending("disconnected");
    setStatus("disconnected");
    setStatusMessage("Disconnected by user");
    appendLog("manual disconnect");
  }, [appendLog, clearReconnectTimer, closeSocket, rejectAllPending]);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      closeSocket();
      rejectAllPending("unmount");
    };
  }, [clearReconnectTimer, closeSocket, rejectAllPending]);

  useEffect(() => {
    if (!selectedSessionKey) {
      return;
    }
    void loadHistory(selectedSessionKey);
  }, [loadHistory, selectedSessionKey]);

  const sendChat = useCallback(async () => {
    if (!selectedSessionKey || !chatInput.trim()) {
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
      appendLog(`chat.send ok (${idempotencyKey})`);
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

  if (!fontsLoaded) {
    return null;
  }

  const statusColor =
    status === "connected"
      ? "#16a34a"
      : status === "error"
        ? "#dc2626"
        : status === "reconnecting"
          ? "#d97706"
          : "#0f172a";

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

          <View style={styles.rowGap8}>
            <Pressable style={styles.primaryButton} onPress={() => void performConnect()}>
              <Text style={styles.primaryButtonText}>Connect (challenge/hello)</Text>
            </Pressable>
            <Pressable style={styles.disconnectButton} onPress={disconnect}>
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </Pressable>
          </View>

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
            <Text style={styles.metaText}>Copy uses expo-clipboard on native.</Text>
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
  rowGap8: {
    flexDirection: "row",
    gap: 8,
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    flex: 1,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 13,
  },
  disconnectButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#475569",
  },
  disconnectButtonText: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 13,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  sendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
