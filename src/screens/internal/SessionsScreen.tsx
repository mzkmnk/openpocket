import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { GatewayClient } from "../../core/gateway/GatewayClient";
import { loadGatewayConnectionSecrets } from "../../core/security/connectionSecrets";
import {
  loadOrCreateDeviceIdentity,
  persistDeviceToken,
  type DeviceIdentity,
} from "../../core/security/deviceIdentity";
import { buildGatewayOperatorConnectParams } from "../../core/security/deviceAuth";
import type { SecureStoreAdapter } from "../../core/security/secureStore";
import { SessionsService } from "../../core/sessions/SessionsService";
import type { SessionListItem } from "../../core/sessions/types";
import type { RootStackParamList } from "../../router/types";

type SessionsTab = "all" | "pinned" | "recent";
type SessionsNavigationProp = NativeStackNavigationProp<RootStackParamList, "internal/sessions">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createStoreAdapter(): SecureStoreAdapter {
  if (Platform.OS === "web") {
    return {
      async getItem(key) {
        return globalThis.localStorage?.getItem(key) ?? null;
      },
      async setItem(key, value) {
        globalThis.localStorage?.setItem(key, value);
      },
      async deleteItem(key) {
        globalThis.localStorage?.removeItem(key);
      },
    };
  }

  return {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItem: (key) => SecureStore.deleteItemAsync(key),
  };
}

function formatUpdatedAt(updatedAt: number): string {
  if (!updatedAt || updatedAt <= 0) {
    return "Unknown";
  }

  const now = new Date();
  const target = new Date(updatedAt);
  const isSameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  if (isSameDay) {
    return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(target);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    target.getFullYear() === yesterday.getFullYear() &&
    target.getMonth() === yesterday.getMonth() &&
    target.getDate() === yesterday.getDate();
  if (isYesterday) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" }).format(target);
}

function colorForSession(key: string): { bg: string; fg: string } {
  const palette = [
    { bg: "#DBEAFE", fg: "#1D4ED8" },
    { bg: "#FFEDD5", fg: "#C2410C" },
    { bg: "#F3E8FF", fg: "#7E22CE" },
    { bg: "#CCFBF1", fg: "#0F766E" },
    { bg: "#FCE7F3", fg: "#BE185D" },
    { bg: "#E2E8F0", fg: "#475569" },
  ] as const;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0];
}

export function SessionsScreen() {
  const navigation = useNavigation<SessionsNavigationProp>();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const store = useMemo(() => createStoreAdapter(), []);

  const [allSessions, setAllSessions] = useState<SessionListItem[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState("");
  const [searchText, setSearchText] = useState("");
  const [tab, setTab] = useState<SessionsTab>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionDetail, setConnectionDetail] = useState("Connecting to gateway...");
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [editingSession, setEditingSession] = useState<SessionListItem | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [isSavingLabel, setIsSavingLabel] = useState(false);

  const clientRef = useRef<GatewayClient | null>(null);
  const serviceRef = useRef<SessionsService | null>(null);

  const refreshSessions = useCallback(
    async (useRefreshingState: boolean) => {
      const service = serviceRef.current;
      if (!service) {
        throw new Error("Session service is not ready");
      }

      if (useRefreshingState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage("");

      try {
        const result = await service.listSessions();
        setAllSessions(result);
        if (result.length > 0 && !activeSessionKey) {
          setActiveSessionKey(result[0]?.key ?? "");
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load sessions");
      } finally {
        if (useRefreshingState) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [activeSessionKey],
  );

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const secrets = await loadGatewayConnectionSecrets(store);
      if (!secrets.gatewayUrl.trim() || !secrets.token.trim()) {
        throw new Error("Gateway URL or token is missing. Please reconnect from the login screen.");
      }

      const loadedIdentity = await loadOrCreateDeviceIdentity(store, Crypto.getRandomBytes);
      setIdentity(loadedIdentity.identity);

      const client = new GatewayClient({
        onStatusChange(_status, detail) {
          setConnectionDetail(detail);
        },
      });
      clientRef.current = client;

      const hello = await client.connect({
        gatewayUrl: secrets.gatewayUrl.trim(),
        buildConnectParams: (challengePayload) => {
          return buildGatewayOperatorConnectParams({
            challengePayload,
            identity: loadedIdentity.identity,
            token: secrets.token.trim(),
          });
        },
      });

      if (isRecord(hello) && isRecord(hello.auth) && typeof hello.auth.deviceToken === "string") {
        const nextIdentity = await persistDeviceToken(
          store,
          loadedIdentity.identity,
          hello.auth.deviceToken,
        );
        setIdentity(nextIdentity);
      }

      serviceRef.current = new SessionsService(client, store);
      await refreshSessions(false);
      setConnectionDetail("Connected");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to initialize sessions");
      setConnectionDetail("Connection unavailable");
      setIsLoading(false);
    }
  }, [refreshSessions, store]);

  useEffect(() => {
    void initialize();
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
      serviceRef.current = null;
    };
  }, [initialize]);

  const filteredSessions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    const searched =
      normalizedSearch.length === 0
        ? allSessions
        : allSessions.filter((item) => {
            return (
              item.label.toLowerCase().includes(normalizedSearch) ||
              item.key.toLowerCase().includes(normalizedSearch)
            );
          });

    if (tab === "pinned") {
      return searched.filter((item) => item.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    }
    if (tab === "recent") {
      return searched.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return searched;
  }, [allSessions, searchText, tab]);

  const onTogglePin = useCallback(
    async (item: SessionListItem) => {
      const service = serviceRef.current;
      if (!service) {
        return;
      }
      await service.togglePinned(item.key);
      await refreshSessions(true);
    },
    [refreshSessions],
  );

  const onOpenEdit = useCallback((item: SessionListItem) => {
    setEditingSession(item);
    setDraftLabel(item.label);
  }, []);

  const onSaveLabel = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || !editingSession) {
      return;
    }
    setIsSavingLabel(true);
    try {
      await service.updateSessionLabel(editingSession.key, draftLabel);
      setEditingSession(null);
      setDraftLabel("");
      await refreshSessions(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update label");
    } finally {
      setIsSavingLabel(false);
    }
  }, [draftLabel, editingSession, refreshSessions]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Sessions</Text>
        <Pressable
          style={styles.refreshButton}
          onPress={() => void refreshSessions(true)}
          disabled={isRefreshing || isLoading}
        >
          <Text style={styles.refreshButtonText}>{isRefreshing ? "..." : "Refresh"}</Text>
        </Pressable>
      </View>

      <Text style={styles.connectionText}>
        {connectionDetail}
        {identity ? ` • ${identity.deviceId.slice(0, 8)}...` : ""}
      </Text>

      <View style={styles.searchWrap}>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search label or session key"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />
        {searchText.length > 0 ? (
          <Pressable style={styles.clearSearchButton} onPress={() => setSearchText("")}>
            <Text style={styles.clearSearchButtonText}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tabWrap}>
        {(["all", "pinned", "recent"] as const).map((value) => (
          <Pressable
            key={value}
            style={[styles.tabButton, tab === value ? styles.tabButtonActive : null]}
            onPress={() => setTab(value)}
          >
            <Text style={[styles.tabText, tab === value ? styles.tabTextActive : null]}>
              {value === "all" ? "All" : value === "pinned" ? "Pinned" : "Recent"}
            </Text>
          </Pressable>
        ))}
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <View style={styles.errorTextWrap}>
            <Text style={styles.errorTitle}>Error loading sessions</Text>
            <Text style={styles.errorBody}>{errorMessage}</Text>
          </View>
          <Pressable style={styles.errorButton} onPress={() => void initialize()}>
            <Text style={styles.errorButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color="#137FEC" />
          <Text style={styles.centerStateTitle}>Loading sessions...</Text>
        </View>
      ) : filteredSessions.length === 0 && searchText.trim().length > 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.centerStateIcon}>⌕</Text>
          <Text style={styles.centerStateTitle}>No matching sessions</Text>
          <Text style={styles.centerStateBody}>
            {`We could not find sessions matching "${searchText.trim()}". Try a different keyword.`}
          </Text>
          <Pressable style={styles.softButton} onPress={() => setSearchText("")}>
            <Text style={styles.softButtonText}>Clear search</Text>
          </Pressable>
        </View>
      ) : filteredSessions.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.centerStateIcon}>☰</Text>
          <Text style={styles.centerStateTitle}>No sessions yet</Text>
          <Text style={styles.centerStateBody}>
            Start a conversation to create your first session, then come back here to manage it.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSessions}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={() => void refreshSessions(true)}
          renderItem={({ item }) => {
            const avatarColor = colorForSession(item.key);
            const isActive = activeSessionKey === item.key;
            return (
              <View style={[styles.itemWrap, isActive ? styles.itemWrapActive : null]}>
                <Pressable
                  style={styles.itemMain}
                  onPress={() => {
                    setActiveSessionKey(item.key);
                    navigation.navigate("internal/chat", {
                      sessionKey: item.key,
                      sessionLabel: item.label,
                    });
                  }}
                >
                  <View style={[styles.itemAvatar, { backgroundColor: avatarColor.bg }]}>
                    <Text style={[styles.itemAvatarText, { color: avatarColor.fg }]}>◉</Text>
                  </View>
                  <View style={styles.itemTextWrap}>
                    <View style={styles.itemTopLine}>
                      <Text style={styles.itemLabel} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text style={styles.itemTime}>{formatUpdatedAt(item.updatedAt)}</Text>
                    </View>
                    <Text style={styles.itemPreview} numberOfLines={2}>
                      {item.preview.trim() || "No messages yet"}
                    </Text>
                    <Text style={styles.itemKey} numberOfLines={1}>
                      {item.key}
                    </Text>
                  </View>
                </Pressable>

                <View style={styles.itemActions}>
                  <Pressable style={styles.iconAction} onPress={() => void onTogglePin(item)}>
                    <Text style={[styles.iconActionText, item.pinned ? styles.iconPinned : null]}>
                      ★
                    </Text>
                  </Pressable>
                  <Pressable style={styles.iconAction} onPress={() => onOpenEdit(item)}>
                    <Text style={styles.iconActionText}>✎</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={Boolean(editingSession)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSession(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setEditingSession(null)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Edit session label</Text>
            <Text style={styles.modalBody}>Give your session a memorable name.</Text>
            <TextInput
              value={draftLabel}
              onChangeText={setDraftLabel}
              placeholder="Label name"
              placeholderTextColor="#94A3B8"
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setEditingSession(null)}
                disabled={isSavingLabel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={() => void onSaveLabel()}
                disabled={isSavingLabel}
              >
                <Text style={styles.modalSaveText}>
                  {isSavingLabel ? "Saving..." : "Save Changes"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    letterSpacing: -0.2,
    color: "#0F172A",
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#F8FAFC",
  },
  refreshButtonText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: "#334155",
  },
  connectionText: {
    paddingHorizontal: 16,
    color: "#64748B",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginBottom: 10,
  },
  searchWrap: {
    marginHorizontal: 16,
    marginBottom: 10,
    position: "relative",
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingVertical: 11,
    paddingHorizontal: 14,
    paddingRight: 36,
    fontSize: 14,
    color: "#0F172A",
    fontFamily: "SpaceGrotesk_400Regular",
  },
  clearSearchButton: {
    position: "absolute",
    right: 12,
    top: 9,
  },
  clearSearchButtonText: {
    fontSize: 20,
    color: "#94A3B8",
    fontFamily: "SpaceGrotesk_500Medium",
    lineHeight: 24,
  },
  tabWrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: {
    color: "#64748B",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  tabTextActive: {
    color: "#0F172A",
    fontFamily: "SpaceGrotesk_700Bold",
  },
  errorCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  errorTextWrap: {
    flex: 1,
  },
  errorTitle: {
    color: "#B91C1C",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
  },
  errorBody: {
    color: "#7F1D1D",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  errorButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorButtonText: {
    color: "#B91C1C",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
    gap: 8,
  },
  itemWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  itemWrapActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#F8FBFF",
  },
  itemMain: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  itemAvatar: {
    marginTop: 2,
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  itemAvatarText: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  itemTopLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  itemLabel: {
    flex: 1,
    fontFamily: "SpaceGrotesk_700Bold",
    color: "#0F172A",
    fontSize: 14,
    letterSpacing: -0.1,
  },
  itemTime: {
    color: "#3B82F6",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  itemPreview: {
    marginTop: 4,
    color: "#64748B",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },
  itemKey: {
    marginTop: 6,
    color: "#94A3B8",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
  },
  itemActions: {
    gap: 6,
    paddingTop: 2,
  },
  iconAction: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  iconActionText: {
    fontSize: 15,
    color: "#94A3B8",
    fontFamily: "SpaceGrotesk_500Medium",
  },
  iconPinned: {
    color: "#F59E0B",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  centerStateIcon: {
    color: "#CBD5E1",
    fontSize: 34,
    fontFamily: "SpaceGrotesk_700Bold",
    marginBottom: 2,
  },
  centerStateTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontFamily: "SpaceGrotesk_700Bold",
    textAlign: "center",
  },
  centerStateBody: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
    maxWidth: 280,
  },
  softButton: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  softButtonText: {
    fontSize: 12,
    color: "#334155",
    fontFamily: "SpaceGrotesk_700Bold",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  modalBody: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  modalInput: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: "#0F172A",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  modalActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  modalButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
  },
  modalCancelButton: {
    backgroundColor: "#F1F5F9",
  },
  modalCancelText: {
    color: "#475569",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
  },
  modalSaveButton: {
    backgroundColor: "#137FEC",
  },
  modalSaveText: {
    color: "#FFFFFF",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
  },
});
