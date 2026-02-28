import { useFonts, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  clearGatewayConnectionSecrets,
  loadGatewayConnectionSecrets,
  saveGatewayConnectionSecrets,
} from "./src/core/security/connectionSecrets";
import { loadOrCreateDeviceIdentity } from "./src/core/security/deviceIdentity";
import type { SecureStoreAdapter } from "./src/core/security/secureStore";

import "./global.css";

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

function maskToken(value: string): string {
  if (!value) {
    return "(empty)";
  }
  return `•••••• (${value.length})`;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
  });
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState("Loading secure settings...");
  const [deviceInfo, setDeviceInfo] = useState("");

  const store = useMemo(() => createStoreAdapter(), []);

  const loadSecureState = useCallback(async () => {
    try {
      const secrets = await loadGatewayConnectionSecrets(store);
      setGatewayUrl(secrets.gatewayUrl);
      setToken(secrets.token);

      const identity = await loadOrCreateDeviceIdentity(store, Crypto.getRandomBytes);
      setDeviceInfo(`${identity.source}: ${identity.identity.deviceId.slice(0, 12)}...`);
      setStatus("Secure settings loaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Failed to load secure settings: ${message}`);
    }
  }, [store]);

  useEffect(() => {
    void loadSecureState();
  }, [loadSecureState]);

  const save = useCallback(async () => {
    await saveGatewayConnectionSecrets(store, { gatewayUrl, token });
    setStatus(`Saved token ${maskToken(token)} in secure storage`);
  }, [gatewayUrl, store, token]);

  const clear = useCallback(async () => {
    await clearGatewayConnectionSecrets(store);
    setGatewayUrl("");
    setToken("");
    setStatus("Cleared secure settings");
  }, [store]);

  const regenerateIdentity = useCallback(async () => {
    await store.deleteItem("openpocket.gateway.device.identity.v1");
    const next = await loadOrCreateDeviceIdentity(store, Crypto.getRandomBytes);
    setDeviceInfo(`${next.source}: ${next.identity.deviceId.slice(0, 12)}...`);
    setStatus("Device identity regenerated. Re-pairing may be required.");
  }, [store]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <Text style={[styles.title, { fontFamily: "SpaceGrotesk_700Bold" }]}>
        openpocket security settings
      </Text>
      <Text style={styles.caption}>{status}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Gateway URL</Text>
        <TextInput
          value={gatewayUrl}
          onChangeText={setGatewayUrl}
          placeholder="wss://gateway.example.ts.net/"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.label}>Gateway token</Text>
        <View style={styles.row}>
          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="Paste token"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showToken}
            style={[styles.input, styles.tokenInput]}
          />
          <Pressable style={styles.toggle} onPress={() => setShowToken((prev) => !prev)}>
            <Text style={styles.toggleText}>{showToken ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        <Text style={styles.caption}>Stored token: {maskToken(token)}</Text>

        <View style={styles.row}>
          <Pressable style={styles.button} onPress={() => void save()}>
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => void clear()}>
            <Text style={styles.buttonText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Device identity</Text>
        <Text style={styles.caption}>{deviceInfo}</Text>
        <Pressable style={styles.button} onPress={() => void regenerateIdentity()}>
          <Text style={styles.buttonText}>Regenerate identity</Text>
        </Pressable>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    color: "#0f172a",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
  },
  label: {
    color: "#1e293b",
    fontWeight: "600",
  },
  caption: {
    color: "#475569",
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  tokenInput: {
    flex: 1,
  },
  toggle: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#94a3b8",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toggleText: {
    color: "#334155",
    fontWeight: "600",
  },
  button: {
    borderRadius: 8,
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
