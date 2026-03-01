import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GatewayClient } from "../../core/gateway/GatewayClient";
import { loadGatewayConnectionSecrets } from "../../core/security/connectionSecrets";
import { buildGatewayOperatorConnectParams } from "../../core/security/deviceAuth";
import { loadOrCreateDeviceIdentity, persistDeviceToken } from "../../core/security/deviceIdentity";
import type { SecureStoreAdapter } from "../../core/security/secureStore";
import type { RootStackParamList } from "../../router/types";

const AUTH_PROMPT_MESSAGE = "Authenticate with Face ID / Biometrics to open OpenPocket";

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

async function authenticateOnLaunch(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  if (Constants.appOwnership === "expo") {
    return;
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
  if (!hasHardware || !isEnrolled) {
    return;
  }

  const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const supportsFacialRecognition = supportedTypes.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );

  if (Platform.OS === "ios" && !supportsFacialRecognition) {
    throw new Error("Face ID is not available on this device.");
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: AUTH_PROMPT_MESSAGE,
    cancelLabel: "Cancel",
    disableDeviceFallback: true,
    fallbackLabel: "",
    biometricsSecurityLevel: "strong",
  });

  if (!result.success) {
    switch (result.error) {
      case "user_cancel":
      case "system_cancel":
        throw new Error("Authentication was canceled.");
      case "not_enrolled":
      case "passcode_not_set":
        throw new Error("Biometric authentication is not set up on this device.");
      case "lockout":
        throw new Error("Biometrics are locked. Unlock biometrics in system settings and retry.");
      default:
        throw new Error("Biometric authentication failed.");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function verifyPersistedLogin(store: SecureStoreAdapter): Promise<boolean> {
  const secrets = await loadGatewayConnectionSecrets(store);
  if (!secrets.gatewayUrl.trim() || !secrets.token.trim()) {
    return false;
  }

  const loadedIdentity = await loadOrCreateDeviceIdentity(store, Crypto.getRandomBytes);
  const client = new GatewayClient({
    reconnect: { enabled: false, initialDelayMs: 0, maxDelayMs: 0, factor: 1 },
  });

  try {
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
      await persistDeviceToken(store, loadedIdentity.identity, hello.auth.deviceToken);
    }
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

export function AuthGateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const store = useMemo(() => createStoreAdapter(), []);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        setErrorMessage("");
        await authenticateOnLaunch();
        const isLoggedIn = await verifyPersistedLogin(store);
        if (!mounted) {
          return;
        }
        navigation.replace(isLoggedIn ? "internal/main" : "auth/login");
      } catch (error) {
        if (!mounted) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Failed to authenticate");
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [navigation, retryCount, store]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#78A6FF" />
        <Text style={styles.title}>OpenPocket</Text>
        <Text style={styles.message}>{errorMessage || "Checking login status..."}</Text>
        {errorMessage ? (
          <Pressable style={styles.retryButton} onPress={() => setRetryCount((count) => count + 1)}>
            <Text style={styles.retryButtonText}>Retry authentication</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#05050A",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    color: "#F8F8FF",
    fontSize: 20,
    fontWeight: "700",
  },
  message: {
    color: "#A6ABBF",
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#1A2848",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#DCE7FF",
    fontSize: 14,
    fontWeight: "600",
  },
});
