import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AgentsService } from "../../core/agents/AgentsService";
import type { GatewayAgentSummary } from "../../core/agents/types";
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
import type { RootStackParamList } from "../../router/types";

type SessionCreateNavigationProp = NativeStackNavigationProp<RootStackParamList, "internal/session-create">;

type GatewayFeatureFlags = {
  canListAgents: boolean;
};

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

function createNewSessionKey(deviceId?: string): string {
  const safeDeviceId = (deviceId ?? "mobile")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 12);
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${safeDeviceId}-${timestampPart}-${randomPart}`;
}

function readGatewayFeatureFlags(hello: unknown): GatewayFeatureFlags {
  if (!isRecord(hello) || !isRecord(hello.features) || !Array.isArray(hello.features.methods)) {
    return { canListAgents: false };
  }

  const methods = new Set(
    hello.features.methods.filter((method): method is string => typeof method === "string"),
  );
  return { canListAgents: methods.has("agents.list") };
}

function toAgentDisplayName(agent: GatewayAgentSummary): string {
  const preferred = agent.identity?.name ?? agent.name ?? agent.id;
  const trimmed = preferred.trim();
  return trimmed.length > 0 ? trimmed : agent.id;
}

export function SessionCreateScreen() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    MaterialIcons: require("react-native-vector-icons/Fonts/MaterialIcons.ttf"),
  });
  const navigation = useNavigation<SessionCreateNavigationProp>();
  const store = useMemo(() => createStoreAdapter(), []);

  const clientRef = useRef<GatewayClient | null>(null);
  const serviceRef = useRef<SessionsService | null>(null);

  const [titleDraft, setTitleDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionDetail, setConnectionDetail] = useState("Connecting to gateway...");
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [canListAgents, setCanListAgents] = useState(false);
  const [agentsMainKey, setAgentsMainKey] = useState("main");
  const [defaultAgentId, setDefaultAgentId] = useState("");
  const [availableAgents, setAvailableAgents] = useState<GatewayAgentSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");

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
      const features = readGatewayFeatureFlags(hello);
      setCanListAgents(features.canListAgents);

      if (features.canListAgents) {
        const agentsService = new AgentsService(client);
        const result = await agentsService.listAgents();
        setAgentsMainKey(result.mainKey);
        setDefaultAgentId(result.defaultId);
        setAvailableAgents(result.agents);
        setSelectedAgentId(result.defaultId || result.agents[0]?.id || "");
      } else {
        setAgentsMainKey("main");
        setDefaultAgentId("");
        setAvailableAgents([]);
        setSelectedAgentId("");
      }

      setConnectionDetail("Connected");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to initialize create screen");
      setConnectionDetail("Connection unavailable");
    } finally {
      setIsLoading(false);
    }
  }, [store]);

  const onCreate = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || isCreating) {
      return;
    }

    setIsCreating(true);
    setErrorMessage("");

    try {
      const selectedAgent = availableAgents.find((agent) => agent.id === selectedAgentId);
      const baseSessionKey =
        selectedAgent && canListAgents
          ? `agent:${selectedAgent.id}:${agentsMainKey}`
          : createNewSessionKey(identity?.deviceId);

      const resetResult = await service.resetSession(baseSessionKey, "new");
      const sessionKey =
        typeof resetResult.key === "string" && resetResult.key.trim().length > 0
          ? resetResult.key
          : baseSessionKey;

      const normalizedTitle = titleDraft.trim();
      if (normalizedTitle.length > 0) {
        await service.setLocalSessionLabel(sessionKey, normalizedTitle);
      }

      const resolvedLabel =
        normalizedTitle || (selectedAgent ? toAgentDisplayName(selectedAgent) : "New Session");

      navigation.replace("internal/chat", {
        sessionKey,
        sessionLabel: resolvedLabel,
        sessionModel: "",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create session");
    } finally {
      setIsCreating(false);
    }
  }, [
    agentsMainKey,
    availableAgents,
    canListAgents,
    identity?.deviceId,
    isCreating,
    navigation,
    selectedAgentId,
    titleDraft,
  ]);

  useEffect(() => {
    void initialize();
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
      serviceRef.current = null;
    };
  }, [initialize]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={18} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>New Session</Text>
        <Pressable
          style={[styles.headerIconButton, isLoading || isCreating ? styles.headerIconDisabled : null]}
          onPress={() => void onCreate()}
          disabled={isLoading || isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#137FEC" />
          ) : (
            <MaterialIcons name="check" size={18} color="#137FEC" />
          )}
        </Pressable>
      </View>

      <Text style={styles.connectionText}>
        {connectionDetail}
        {identity ? ` • ${identity.deviceId.slice(0, 8)}...` : ""}
      </Text>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Create Error</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Title</Text>
        <TextInput
          value={titleDraft}
          onChangeText={setTitleDraft}
          placeholder="Enter title (optional)"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          editable={!isLoading && !isCreating}
        />

        <Text style={styles.sectionLabel}>Choose Agent</Text>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#137FEC" />
            <Text style={styles.loadingText}>Loading agents...</Text>
          </View>
        ) : !canListAgents || availableAgents.length === 0 ? (
          <View style={styles.emptyAgentCard}>
            <Text style={styles.emptyAgentTitle}>Default Agent</Text>
            <Text style={styles.emptyAgentBody}>
              Agent list is unavailable. A standard session will be created.
            </Text>
          </View>
        ) : (
          <FlatList
            data={availableAgents}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.agentListContent}
            renderItem={({ item }) => {
              const isDefault = item.id === defaultAgentId;
              const isSelected = item.id === selectedAgentId;
              return (
                <Pressable
                  style={[styles.agentItem, isSelected ? styles.agentItemSelected : null]}
                  onPress={() => setSelectedAgentId(item.id)}
                  disabled={isCreating}
                >
                  <View style={styles.agentTextWrap}>
                    <Text style={styles.agentName} numberOfLines={1}>
                      {toAgentDisplayName(item)}
                    </Text>
                    <Text style={styles.agentMeta} numberOfLines={1}>
                      {item.id}
                    </Text>
                  </View>
                  <View style={styles.agentBadges}>
                    {isDefault ? <Text style={styles.defaultBadge}>Default</Text> : null}
                    <MaterialIcons
                      name={isSelected ? "radio-button-checked" : "radio-button-unchecked"}
                      size={18}
                      color={isSelected ? "#137FEC" : "#94A3B8"}
                    />
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

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
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#0F172A",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  headerIconDisabled: {
    opacity: 0.5,
  },
  connectionText: {
    paddingHorizontal: 16,
    paddingTop: 10,
    color: "#64748B",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
  },
  errorCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    padding: 10,
  },
  errorTitle: {
    color: "#B91C1C",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 12,
  },
  errorBody: {
    marginTop: 2,
    color: "#7F1D1D",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionLabel: {
    color: "#334155",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_700Bold",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
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
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  emptyAgentCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 12,
  },
  emptyAgentTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  emptyAgentBody: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  agentListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  agentItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  agentItemSelected: {
    borderColor: "#93C5FD",
    backgroundColor: "#F8FBFF",
  },
  agentTextWrap: {
    flex: 1,
  },
  agentName: {
    color: "#0F172A",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  agentMeta: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  agentBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  defaultBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 10,
    fontFamily: "SpaceGrotesk_700Bold",
    paddingVertical: 3,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
});
