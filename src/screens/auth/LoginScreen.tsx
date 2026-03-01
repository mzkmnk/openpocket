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
import { Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GatewayClient } from "../../core/gateway/GatewayClient";
import {
  clearGatewayConnectionSecrets,
  loadGatewayConnectionSecrets,
  saveGatewayConnectionSecrets,
} from "../../core/security/connectionSecrets";
import {
  loadOrCreateDeviceIdentity,
  persistDeviceToken,
  type DeviceIdentity,
  type DeviceIdentityLoadResult,
} from "../../core/security/deviceIdentity";
import { buildGatewayOperatorConnectParams } from "../../core/security/deviceAuth";
import type { SecureStoreAdapter } from "../../core/security/secureStore";
import {
  AdvancedSettingsSection,
  classifyError,
  ConnectionErrorCard,
  ConnectionFormCard,
  ConnectionStatusCard,
  normalizeErrorMessage,
  styles,
  validateFields,
  type GatewayConnectionStatus,
  type StatusCardModel,
  type UiConnectionError,
} from "../../features/connectionSetup";
import type { RootStackParamList } from "../../router/types";

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

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  const store = useMemo(() => createStoreAdapter(), []);
  const clientRef = useRef<GatewayClient | null>(null);

  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const [gatewayUrlError, setGatewayUrlError] = useState("");
  const [tokenError, setTokenError] = useState("");

  const [status, setStatus] = useState<GatewayConnectionStatus>("disconnected");
  const [previousStatus, setPreviousStatus] = useState<GatewayConnectionStatus>("disconnected");
  const [statusDetail, setStatusDetail] = useState("Not connected");
  const [notice, setNotice] = useState("Loading secure settings...");
  const [connectionError, setConnectionError] = useState<UiConnectionError | null>(null);

  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [deviceInfo, setDeviceInfo] = useState("");

  const loadSecureState = useCallback(async () => {
    try {
      const secrets = await loadGatewayConnectionSecrets(store);
      setGatewayUrl(secrets.gatewayUrl);
      setToken(secrets.token);

      const loaded = await loadOrCreateDeviceIdentity(store, Crypto.getRandomBytes);
      setIdentity(loaded.identity);
      setDeviceInfo(`${loaded.source}: ${loaded.identity.deviceId.slice(0, 12)}...`);
      setNotice("Secure settings loaded");
    } catch (error) {
      setNotice(`Failed to load secure settings: ${normalizeErrorMessage(error)}`);
    }
  }, [store]);

  const ensureIdentity = useCallback(async (): Promise<DeviceIdentityLoadResult> => {
    const loaded = await loadOrCreateDeviceIdentity(store, Crypto.getRandomBytes);
    setIdentity(loaded.identity);
    setDeviceInfo(`${loaded.source}: ${loaded.identity.deviceId.slice(0, 12)}...`);
    return loaded;
  }, [store]);

  useEffect(() => {
    clientRef.current = new GatewayClient({
      onStatusChange(nextStatus, detail) {
        setStatus((current) => {
          if (current !== nextStatus) {
            setPreviousStatus(current);
          }
          return nextStatus;
        });
        if (nextStatus === "disconnected" && detail === "Disconnected by user") {
          setStatusDetail("Not connected");
          return;
        }
        setStatusDetail(detail);
      },
    });

    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadSecureState();
  }, [loadSecureState]);

  const connect = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    setConnectionError(null);
    const validation = validateFields(gatewayUrl, token, "token");
    setGatewayUrlError(validation.gatewayUrlError);
    setTokenError(validation.tokenError);

    if (validation.gatewayUrlError || validation.tokenError) {
      return;
    }

    const normalizedGatewayUrl = gatewayUrl.trim();
    const normalizedToken = token.trim();

    try {
      await saveGatewayConnectionSecrets(store, {
        gatewayUrl: normalizedGatewayUrl,
        token: normalizedToken,
      });

      const loadedIdentity = identity ?? (await ensureIdentity()).identity;

      const hello = await client.connect({
        gatewayUrl: normalizedGatewayUrl,
        buildConnectParams: (challengePayload) => {
          return buildGatewayOperatorConnectParams({
            challengePayload,
            identity: loadedIdentity,
            token: normalizedToken,
          });
        },
      });

      if (isRecord(hello) && isRecord(hello.auth) && typeof hello.auth.deviceToken === "string") {
        const nextIdentity = await persistDeviceToken(
          store,
          loadedIdentity,
          hello.auth.deviceToken,
        );
        setIdentity(nextIdentity);
        setDeviceInfo(`updated: ${nextIdentity.deviceId.slice(0, 12)}...`);
      }

      setNotice("Connection established");
      setConnectionError(null);
      navigation.replace("internal/main");
    } catch (error) {
      const classified = classifyError(error);
      setConnectionError(classified);
      setNotice("Connection failed");
    }
  }, [ensureIdentity, gatewayUrl, identity, navigation, store, token]);

  const reconnect = useCallback(async () => {
    clientRef.current?.disconnect();
    await connect();
  }, [connect]);

  const clear = useCallback(async () => {
    await clearGatewayConnectionSecrets(store);
    setGatewayUrl("");
    setToken("");
    setGatewayUrlError("");
    setTokenError("");
    setConnectionError(null);
    setNotice("Cleared secure settings");
    clientRef.current?.disconnect();
  }, [store]);

  const regenerateIdentity = useCallback(async () => {
    await store.deleteItem("openpocket.gateway.device.identity.v1");
    const next = await ensureIdentity();
    setNotice(`Device identity regenerated (${next.source}). Re-pairing may be required.`);
  }, [ensureIdentity, store]);

  if (!fontsLoaded) {
    return null;
  }

  const statusModel: StatusCardModel = {
    current: status,
    previous: previousStatus,
    detail: statusDetail,
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, Platform.OS === "web" ? styles.contentWeb : null]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={[styles.title, { fontFamily: "SpaceGrotesk_700Bold" }]}>
            Connection Setup
          </Text>
          <Text style={styles.subtitle}>Configure WSS endpoint and access token</Text>
        </View>

        <ConnectionFormCard
          gatewayUrl={gatewayUrl}
          token={token}
          showToken={showToken}
          gatewayUrlError={gatewayUrlError}
          tokenError={tokenError}
          status={status}
          onGatewayUrlChange={(next) => {
            setGatewayUrl(next);
            if (gatewayUrlError) {
              setGatewayUrlError("");
            }
          }}
          onTokenChange={(next) => {
            setToken(next);
            if (tokenError) {
              setTokenError("");
            }
          }}
          onToggleShowToken={() => setShowToken((prev) => !prev)}
          onConnect={() => void connect()}
          onClear={() => void clear()}
        />

        <ConnectionStatusCard model={statusModel} />

        <View style={styles.errorSlot}>
          {connectionError ? (
            <ConnectionErrorCard error={connectionError} onReconnect={() => void reconnect()} />
          ) : null}
        </View>

        <AdvancedSettingsSection
          expanded={showAdvancedSettings}
          deviceInfo={deviceInfo}
          notice={notice}
          onToggle={() => setShowAdvancedSettings((prev) => !prev)}
          onRegenerateIdentity={() => void regenerateIdentity()}
        />
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
