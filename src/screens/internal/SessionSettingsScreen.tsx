import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { SecureStoreAdapter } from "../../core/security/secureStore";
import { SessionsService } from "../../core/sessions/SessionsService";
import { useKeyboardDockedOffset } from "../../features/animation/useKeyboardDockedOffset";
import type { RootStackParamList } from "../../router/types";

type SessionSettingsNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "internal/session-settings"
>;
type SessionSettingsRouteProp = RouteProp<RootStackParamList, "internal/session-settings">;

const noopRequester = {
  async request<T = unknown>(): Promise<T> {
    throw new Error("Gateway requester is not available in local-only session settings.");
  },
};

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

export function SessionSettingsScreen() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    MaterialIcons: require("react-native-vector-icons/Fonts/MaterialIcons.ttf"),
  });
  const navigation = useNavigation<SessionSettingsNavigationProp>();
  const route = useRoute<SessionSettingsRouteProp>();
  const store = useMemo(() => createStoreAdapter(), []);
  const service = useMemo(() => new SessionsService(noopRequester, store), [store]);

  const sessionKey = route.params.sessionKey.trim();
  const initialLabel = route.params.sessionLabel?.trim() ?? "";

  const [draftLabel, setDraftLabel] = useState(initialLabel);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { keyboardOffsetAnimated } = useKeyboardDockedOffset();

  const onSave = useCallback(async () => {
    if (sessionKey.length === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await service.setLocalSessionLabel(sessionKey, draftLabel);
      navigation.goBack();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save local title");
    } finally {
      setIsSaving(false);
    }
  }, [draftLabel, isSaving, navigation, service, sessionKey]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={18} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Session Settings</Text>
        <View style={styles.headerIconSpacer} />
      </View>

      <Text style={styles.infoText}>This title is stored only on this device.</Text>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Update Error</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Session title</Text>
        <TextInput
          value={draftLabel}
          onChangeText={setDraftLabel}
          placeholder="Enter title"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          editable={!isSaving}
          autoFocus
        />
      </View>

      <Animated.View
        style={[
          styles.footer,
          {
            transform: [
              {
                translateY: Animated.multiply(keyboardOffsetAnimated, -1),
              },
            ],
          },
        ]}
      >
        <Pressable
          style={[styles.saveButton, isSaving ? styles.saveButtonDisabled : null]}
          onPress={() => void onSave()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </Animated.View>

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
  headerIconSpacer: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#0F172A",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  infoText: {
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
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionLabel: {
    color: "#334155",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_700Bold",
    marginBottom: 8,
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
  footer: {
    marginTop: "auto",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  saveButton: {
    borderRadius: 12,
    backgroundColor: "#137FEC",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_700Bold",
  },
});
