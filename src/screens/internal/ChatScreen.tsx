import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ChatService } from "../../core/chat/ChatService";
import type { ChatEventPayload } from "../../core/chat/types";
import { GatewayClient } from "../../core/gateway/GatewayClient";
import { ModelsService } from "../../core/models/ModelsService";
import type { ModelChoice } from "../../core/models/types";
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

type ChatNavigationProp = NativeStackNavigationProp<RootStackParamList, "internal/chat">;
type ChatRouteProp = RouteProp<RootStackParamList, "internal/chat">;

type UiMessage = {
  id: string;
  role: "assistant" | "user";
  body: string;
  time: string;
};

type GatewayFeatureFlags = {
  canListModels: boolean;
  canPatchSession: boolean;
};

const MODEL_SHEET_CLOSED_Y = 420;

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

function formatTime(value?: number): string {
  const now = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(now);
}

function extractTextFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const chunks = value
      .map((item) => extractTextFromUnknown(item))
      .filter((item) => item.trim().length > 0);
    return chunks.join("\n").trim();
  }
  if (!isRecord(value)) {
    return "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }
  if (typeof value.content === "string") {
    return value.content;
  }
  if (Array.isArray(value.content)) {
    return extractTextFromUnknown(value.content);
  }
  if (Array.isArray(value.parts)) {
    return extractTextFromUnknown(value.parts);
  }
  if (Array.isArray(value.items)) {
    return extractTextFromUnknown(value.items);
  }
  if (isRecord(value.message)) {
    return extractTextFromUnknown(value.message);
  }
  return "";
}

function mapHistoryMessages(messages: unknown[]): UiMessage[] {
  return messages
    .map((message, index) => {
      if (!isRecord(message)) {
        return null;
      }

      const role = message.role === "assistant" ? "assistant" : "user";
      const body = extractTextFromUnknown(message);
      const createdAt =
        typeof message.createdAt === "number"
          ? message.createdAt
          : typeof message.timestamp === "number"
            ? message.timestamp
            : undefined;

      if (body.trim().length === 0) {
        return null;
      }

      return {
        id: `history-${index}`,
        role,
        body: body.trim(),
        time: formatTime(createdAt),
      } satisfies UiMessage;
    })
    .filter((message): message is UiMessage => message !== null);
}

function initialsForRole(role: UiMessage["role"]): string {
  return role === "assistant" ? "OC" : "YO";
}

function readGatewayFeatureFlags(hello: unknown): GatewayFeatureFlags {
  if (!isRecord(hello) || !isRecord(hello.features) || !Array.isArray(hello.features.methods)) {
    return {
      canListModels: false,
      canPatchSession: false,
    };
  }

  const methods = new Set(
    hello.features.methods.filter((method): method is string => typeof method === "string"),
  );
  return {
    canListModels: methods.has("models.list"),
    canPatchSession: methods.has("sessions.patch"),
  };
}

export function ChatScreen() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    MaterialIcons: require("react-native-vector-icons/Fonts/MaterialIcons.ttf"),
  });
  const navigation = useNavigation<ChatNavigationProp>();
  const route = useRoute<ChatRouteProp>();
  const store = useMemo(() => createStoreAdapter(), []);

  const sessionKey = route.params?.sessionKey?.trim() ?? "";
  const sessionLabel = route.params?.sessionLabel?.trim() ?? "Chat";
  const initialSessionModel = route.params?.sessionModel?.trim() ?? "";

  const clientRef = useRef<GatewayClient | null>(null);
  const chatServiceRef = useRef<ChatService | null>(null);
  const sessionsServiceRef = useRef<SessionsService | null>(null);
  const modelsServiceRef = useRef<ModelsService | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const streamTextRef = useRef("");
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const initialScrollPendingRef = useRef(false);
  const initialScrollRunningRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const initialScrollRafRef = useRef<number | null>(null);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionDetail, setConnectionDetail] = useState("Connecting to gateway...");
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelChoice[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(initialSessionModel);
  const [modelUiError, setModelUiError] = useState("");
  const [isModelModalVisible, setIsModelModalVisible] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [modelFeatures, setModelFeatures] = useState<GatewayFeatureFlags>({
    canListModels: false,
    canPatchSession: false,
  });
  const modelSheetTranslateY = useRef(new Animated.Value(MODEL_SHEET_CLOSED_Y)).current;
  const modelBackdropOpacity = useMemo(
    () =>
      modelSheetTranslateY.interpolate({
        inputRange: [0, MODEL_SHEET_CLOSED_Y],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    [modelSheetTranslateY],
  );

  const animateModelModalIn = useCallback(() => {
    modelSheetTranslateY.stopAnimation();
    Animated.spring(modelSheetTranslateY, {
      toValue: 0,
      damping: 20,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [modelSheetTranslateY]);

  const closeModelPicker = useCallback(() => {
    modelSheetTranslateY.stopAnimation();
    Animated.timing(modelSheetTranslateY, {
      toValue: MODEL_SHEET_CLOSED_Y,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsModelModalVisible(false);
        modelSheetTranslateY.setValue(MODEL_SHEET_CLOSED_Y);
      }
    });
  }, [modelSheetTranslateY]);

  const cancelInitialScrollAnimation = useCallback(() => {
    if (initialScrollRafRef.current !== null) {
      cancelAnimationFrame(initialScrollRafRef.current);
      initialScrollRafRef.current = null;
    }
    initialScrollRunningRef.current = false;
  }, []);

  const scrollToBottom = useCallback(
    (animated: boolean) => {
      cancelInitialScrollAnimation();
      requestAnimationFrame(() => {
        messagesScrollRef.current?.scrollToEnd({ animated });
      });
    },
    [cancelInitialScrollAnimation],
  );

  const maybeRunInitialScroll = useCallback(() => {
    if (
      !initialScrollPendingRef.current ||
      initialScrollRunningRef.current ||
      initialScrollDoneRef.current
    ) {
      return;
    }

    if (contentHeightRef.current <= 0 || viewportHeightRef.current <= 0) {
      return;
    }

    const maxOffset = contentHeightRef.current - viewportHeightRef.current;
    if (!Number.isFinite(maxOffset) || maxOffset <= 0) {
      initialScrollPendingRef.current = false;
      initialScrollDoneRef.current = true;
      return;
    }

    const scrollView = messagesScrollRef.current;
    if (!scrollView) {
      return;
    }

    initialScrollRunningRef.current = true;
    scrollView.scrollTo({ y: 0, animated: false });

    const durationMs = Math.min(1800, Math.max(700, maxOffset * 0.55));
    const startedAt = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = progress * progress * progress;
      const y = maxOffset * eased;

      scrollView.scrollTo({ y, animated: false });

      if (progress >= 1) {
        initialScrollRunningRef.current = false;
        initialScrollPendingRef.current = false;
        initialScrollDoneRef.current = true;
        initialScrollRafRef.current = null;
        return;
      }

      initialScrollRafRef.current = requestAnimationFrame(tick);
    };

    initialScrollRafRef.current = requestAnimationFrame(tick);
  }, []);

  const setStreamingText = useCallback((next: string) => {
    streamTextRef.current = next;
    setStreamText(next);
  }, []);

  const appendAssistantMessage = useCallback((body: string) => {
    const normalized = body.trim();
    if (normalized.length === 0) {
      return;
    }
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        body: normalized,
        time: formatTime(),
      },
    ]);
  }, []);

  const onChatEvent = useCallback(
    (payload: ChatEventPayload) => {
      if (activeRunIdRef.current && payload.runId !== activeRunIdRef.current) {
        return;
      }

      if (payload.state === "delta") {
        const delta = extractTextFromUnknown(payload.message);
        if (delta.length > 0) {
          setStreamingText(delta);
          setIsStreaming(true);
          scrollToBottom(true);
        }
        return;
      }

      if (payload.state === "final") {
        const finalText = extractTextFromUnknown(payload.message) || streamTextRef.current;
        appendAssistantMessage(finalText);
        activeRunIdRef.current = null;
        setStreamingText("");
        setIsStreaming(false);
        scrollToBottom(true);
        return;
      }

      if (payload.state === "aborted") {
        const finalText = extractTextFromUnknown(payload.message) || streamTextRef.current;
        appendAssistantMessage(finalText);
        activeRunIdRef.current = null;
        setStreamingText("");
        setIsStreaming(false);
        scrollToBottom(true);
        return;
      }

      if (payload.state === "error") {
        activeRunIdRef.current = null;
        setStreamingText("");
        setIsStreaming(false);
        setErrorMessage(payload.errorMessage ?? "Chat stream failed");
      }
    },
    [appendAssistantMessage, scrollToBottom, setStreamingText],
  );

  const loadModelCatalog = useCallback(async () => {
    if (!modelFeatures.canListModels) {
      return;
    }
    const service = modelsServiceRef.current;
    if (!service) {
      return;
    }

    setIsLoadingModels(true);
    try {
      const models = await service.listModels();
      setModelOptions(models);
      setModelUiError("");
    } catch (error) {
      setModelUiError(error instanceof Error ? error.message : "Failed to load model catalog");
    } finally {
      setIsLoadingModels(false);
    }
  }, [modelFeatures.canListModels]);

  const openModelPicker = useCallback(async () => {
    if (!modelFeatures.canListModels) {
      setModelUiError("This gateway does not support models.list.");
      return;
    }
    if (!modelFeatures.canPatchSession) {
      setModelUiError("This gateway does not allow sessions.patch for model switching.");
      return;
    }
    setIsModelModalVisible(true);
    modelSheetTranslateY.setValue(MODEL_SHEET_CLOSED_Y);
    requestAnimationFrame(() => {
      animateModelModalIn();
    });
    if (modelOptions.length === 0) {
      void loadModelCatalog();
    }
  }, [
    animateModelModalIn,
    loadModelCatalog,
    modelFeatures.canListModels,
    modelFeatures.canPatchSession,
    modelOptions,
    modelSheetTranslateY,
  ]);

  const selectModel = useCallback(
    async (modelId: string) => {
      const service = sessionsServiceRef.current;
      if (!service || !sessionKey || isSwitchingModel) {
        return;
      }

      setIsSwitchingModel(true);
      setModelUiError("");
      try {
        await service.updateSessionModel(sessionKey, modelId);
        setSelectedModelId(modelId);
        closeModelPicker();
      } catch (error) {
        setModelUiError(error instanceof Error ? error.message : "Failed to switch model");
      } finally {
        setIsSwitchingModel(false);
      }
    },
    [closeModelPicker, isSwitchingModel, sessionKey],
  );

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    setModelUiError("");
    cancelInitialScrollAnimation();
    initialScrollPendingRef.current = false;
    initialScrollDoneRef.current = false;
    contentHeightRef.current = 0;
    viewportHeightRef.current = 0;

    if (!sessionKey) {
      setErrorMessage("Session key is required. Please open chat from the sessions screen.");
      setConnectionDetail("Session key is missing");
      setIsLoading(false);
      return;
    }

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

      const features = readGatewayFeatureFlags(hello);
      setModelFeatures(features);

      const service = new ChatService(client, { eventSource: client });
      chatServiceRef.current = service;
      sessionsServiceRef.current = new SessionsService(client, store);
      modelsServiceRef.current = new ModelsService(client);
      unsubscribeRef.current?.();
      unsubscribeRef.current = service.onChatEvent(onChatEvent, { sessionKey });

      if (initialSessionModel) {
        setSelectedModelId(initialSessionModel);
      }
      if (features.canListModels) {
        try {
          const models = await modelsServiceRef.current.listModels();
          setModelOptions(models);
        } catch (error) {
          setModelUiError(error instanceof Error ? error.message : "Failed to load model catalog");
          setModelOptions([]);
        }
      }

      const history = await service.getHistory({ sessionKey, limit: 200 });
      setMessages(mapHistoryMessages(history.messages));
      initialScrollPendingRef.current = true;
      setConnectionDetail("Connected");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to initialize chat");
      setConnectionDetail("Connection unavailable");
    } finally {
      setIsLoading(false);
    }
  }, [cancelInitialScrollAnimation, initialSessionModel, onChatEvent, sessionKey, store]);

  const sendMessage = useCallback(async () => {
    const service = chatServiceRef.current;
    const messageText = draft.trim();
    if (!service || !sessionKey || messageText.length === 0 || isSending) {
      return;
    }

    setErrorMessage("");
    setDraft("");
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        body: messageText,
        time: formatTime(),
      },
    ]);
    scrollToBottom(true);

    setIsSending(true);
    try {
      const ack = await service.send({
        sessionKey,
        message: messageText,
      });

      if (ack.status === "error") {
        activeRunIdRef.current = null;
        setIsStreaming(false);
        setErrorMessage(ack.summary);
        return;
      }

      activeRunIdRef.current = ack.runId;
      setIsStreaming(true);
    } catch (error) {
      setIsStreaming(false);
      setErrorMessage(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, scrollToBottom, sessionKey]);

  const abortMessage = useCallback(async () => {
    const service = chatServiceRef.current;
    if (!service || !sessionKey) {
      return;
    }
    try {
      await service.abort({ sessionKey, runId: activeRunIdRef.current ?? undefined });
      activeRunIdRef.current = null;
      setIsStreaming(false);
      setStreamingText("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to abort run");
    }
  }, [sessionKey, setStreamingText]);

  useEffect(() => {
    void initialize();
    return () => {
      cancelInitialScrollAnimation();
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      activeRunIdRef.current = null;
      clientRef.current?.disconnect();
      clientRef.current = null;
      chatServiceRef.current = null;
      sessionsServiceRef.current = null;
      modelsServiceRef.current = null;
    };
  }, [cancelInitialScrollAnimation, initialize]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.header}>
          <Pressable style={styles.headerIconButton} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={18} color="#0F172A" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {sessionLabel}
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusText}>
                {connectionDetail}
                {identity ? ` • ${identity.deviceId.slice(0, 8)}...` : ""}
              </Text>
            </View>
          </View>
          <Pressable style={styles.headerIconButton} onPress={() => void initialize()}>
            <MaterialIcons name="refresh" size={18} color="#0F172A" />
          </Pressable>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Chat Error</Text>
            <Text style={styles.errorBody}>{errorMessage}</Text>
          </View>
        ) : null}
        {modelUiError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Model Switch Error</Text>
            <Text style={styles.errorBody}>{modelUiError}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.centerStateTitle}>Loading chat history...</Text>
          </View>
        ) : (
          <ScrollView
            ref={messagesScrollRef}
            contentContainerStyle={styles.messagesContent}
            style={styles.messagesArea}
            keyboardShouldPersistTaps="handled"
            onLayout={(event) => {
              viewportHeightRef.current = event.nativeEvent.layout.height;
              maybeRunInitialScroll();
            }}
            onContentSizeChange={(_width, height) => {
              contentHeightRef.current = height;
              maybeRunInitialScroll();
            }}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyStateWrap}>
                <Text style={styles.emptyStateTitle}>No messages yet</Text>
                <Text style={styles.emptyStateBody}>
                  Send your first message to start this session.
                </Text>
              </View>
            ) : null}

            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    isAssistant ? styles.messageRowLeft : styles.messageRowRight,
                  ]}
                >
                  {isAssistant ? (
                    <Pressable
                      style={[styles.avatar, styles.avatarAssistant]}
                      onPress={() => void openModelPicker()}
                    >
                      <Text style={styles.avatarText}>{initialsForRole(message.role)}</Text>
                    </Pressable>
                  ) : null}
                  <View
                    style={[
                      styles.messageColumn,
                      isAssistant ? styles.messageColumnLeft : styles.messageColumnRight,
                    ]}
                  >
                    <View style={styles.metaRow}>
                      {isAssistant ? <Text style={styles.metaAuthor}>OpenClaw</Text> : null}
                      <Text style={styles.metaTime}>{message.time}</Text>
                      {!isAssistant ? <Text style={styles.metaAuthor}>You</Text> : null}
                    </View>
                    <View
                      style={[
                        styles.bubble,
                        isAssistant ? styles.assistantBubble : styles.userBubble,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bubbleText,
                          isAssistant ? styles.assistantBubbleText : styles.userBubbleText,
                        ]}
                      >
                        {message.body}
                      </Text>
                    </View>
                  </View>
                  {!isAssistant ? (
                    <View style={[styles.avatar, styles.avatarUser]}>
                      <Text style={styles.avatarText}>{initialsForRole(message.role)}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {streamText.trim().length > 0 ? (
              <View style={[styles.messageRow, styles.messageRowLeft]}>
                <Pressable
                  style={[styles.avatar, styles.avatarAssistant]}
                  onPress={() => void openModelPicker()}
                >
                  <Text style={styles.avatarText}>OC</Text>
                </Pressable>
                <View style={[styles.messageColumn, styles.messageColumnLeft]}>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaAuthor}>OpenClaw</Text>
                    <Text style={styles.metaTime}>typing...</Text>
                  </View>
                  <View style={[styles.bubble, styles.assistantBubble]}>
                    <Text style={[styles.bubbleText, styles.assistantBubbleText]}>
                      {streamText}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrap}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message OpenClaw..."
                placeholderTextColor="#71717A"
                style={styles.textInput}
                multiline
              />
            </View>
            {isStreaming ? (
              <Pressable style={styles.abortButton} onPress={() => void abortMessage()}>
                <Text style={styles.abortButtonText}>Stop</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.sendButton,
                  draft.trim().length === 0 || isSending ? styles.sendButtonDisabled : null,
                ]}
                onPress={() => void sendMessage()}
                disabled={draft.trim().length === 0 || isSending}
              >
                <MaterialIcons
                  name="north"
                  size={18}
                  color="#FFFFFF"
                  style={styles.sendButtonIcon}
                />
              </Pressable>
            )}
          </View>
          <Text style={styles.disclaimer}>OpenClaw can make mistakes. Verify important info.</Text>
        </View>

        <Modal
          visible={isModelModalVisible}
          transparent
          animationType="none"
          onRequestClose={() => closeModelPicker()}
        >
          <View style={styles.modalRoot}>
            <Animated.View style={[styles.modalBackdrop, { opacity: modelBackdropOpacity }]}>
              <Pressable style={styles.modalBackdropPressable} onPress={() => closeModelPicker()} />
            </Animated.View>
            <Animated.View
              style={[
                styles.modelSheet,
                {
                  transform: [{ translateY: modelSheetTranslateY }],
                },
              ]}
            >
              <View style={styles.modelSheetHeader}>
                <Text style={styles.modelSheetTitle}>Model</Text>
                <Pressable style={styles.modelSheetCloseButton} onPress={() => closeModelPicker()}>
                  <MaterialIcons name="close" size={16} color="#334155" />
                </Pressable>
              </View>
              {isLoadingModels ? (
                <View style={styles.modelSheetLoading}>
                  <ActivityIndicator size="small" color="#38BDF8" />
                  <Text style={styles.modelSheetLoadingText}>Loading models...</Text>
                </View>
              ) : (
                <FlatList
                  data={modelOptions}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.modelListContent}
                  ListEmptyComponent={
                    <Text style={styles.modelEmptyText}>No models available from gateway.</Text>
                  }
                  renderItem={({ item }) => {
                    const isSelected = selectedModelId === item.id;
                    return (
                      <Pressable
                        style={[
                          styles.modelListItem,
                          isSelected ? styles.modelListItemSelected : null,
                        ]}
                        onPress={() => void selectModel(item.id)}
                        disabled={isSwitchingModel}
                      >
                        <View style={styles.modelItemTextWrap}>
                          <Text style={styles.modelItemName}>{item.name}</Text>
                          <Text style={styles.modelItemMeta}>{item.provider}</Text>
                        </View>
                        {isSelected ? (
                          <MaterialIcons name="check" size={20} color="#0284C7" />
                        ) : null}
                      </Pressable>
                    );
                  }}
                />
              )}
              {isSwitchingModel ? (
                <Text style={styles.modelSwitchingText}>Applying model...</Text>
              ) : null}
            </Animated.View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
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
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 10,
  },
  headerTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  statusRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#10B981",
  },
  statusText: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
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
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  centerStateTitle: {
    color: "#334155",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  messagesArea: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 22,
  },
  emptyStateWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 16,
    gap: 4,
  },
  emptyStateTitle: {
    color: "#0F172A",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
  },
  emptyStateBody: {
    color: "#64748B",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarAssistant: {
    backgroundColor: "#DBEAFE",
    borderColor: "#BFDBFE",
  },
  avatarUser: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  avatarText: {
    color: "#1E3A8A",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  messageColumn: {
    maxWidth: "84%",
    gap: 6,
  },
  messageColumnLeft: {
    alignItems: "flex-start",
  },
  messageColumnRight: {
    alignItems: "flex-end",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  metaAuthor: {
    color: "#64748B",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  metaTime: {
    color: "#94A3B8",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
  },
  bubble: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  assistantBubble: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderTopLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: "#2563EB",
    borderColor: "#3B82F6",
    borderTopRightRadius: 4,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  assistantBubbleText: {
    color: "#0F172A",
  },
  userBubbleText: {
    color: "#FFFFFF",
  },
  footer: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 6,
    paddingVertical: 0,
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 22,
    color: "#0F172A",
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#1D4ED8",
    opacity: 0.5,
  },
  sendButtonIcon: {
    marginTop: -1,
  },
  abortButton: {
    borderRadius: 8,
    minWidth: 44,
    height: 34,
    paddingHorizontal: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  abortButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  disclaimer: {
    marginTop: 8,
    textAlign: "center",
    color: "#94A3B8",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.24)",
  },
  modalBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  modelSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    maxHeight: "78%",
    borderTopWidth: 1,
    borderColor: "#E2E8F0",
  },
  modelSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modelSheetTitle: {
    color: "#0F172A",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
  },
  modelSheetCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modelSheetLoading: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  modelSheetLoadingText: {
    color: "#64748B",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
  },
  modelListContent: {
    paddingBottom: 16,
    gap: 8,
  },
  modelListItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modelListItemSelected: {
    borderColor: "#0284C7",
    backgroundColor: "#F0F9FF",
  },
  modelItemTextWrap: {
    flex: 1,
    gap: 2,
  },
  modelItemName: {
    color: "#0F172A",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 15,
  },
  modelItemMeta: {
    color: "#64748B",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
  },
  modelEmptyText: {
    color: "#64748B",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
  },
  modelSwitchingText: {
    color: "#0369A1",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
  },
});
