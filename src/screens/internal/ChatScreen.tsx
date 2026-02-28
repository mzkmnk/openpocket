import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { mockMessages, quickActions } from "../../features/chat/mockData";
import type { RootStackParamList } from "../../router/types";

type ChatNavigationProp = NativeStackNavigationProp<RootStackParamList, "internal/chat">;

function initialsForAuthor(author: string): string {
  if (author.toLowerCase() === "you") {
    return "YO";
  }
  return "OC";
}

export function ChatScreen() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const navigation = useNavigation<ChatNavigationProp>();
  const route = useRoute();
  const params = route.params as RootStackParamList["internal/chat"] | undefined;
  const [draft, setDraft] = useState("");

  const sessionTitle = useMemo(() => {
    if (params?.sessionLabel && params.sessionLabel.trim().length > 0) {
      return params.sessionLabel.trim();
    }
    return "Chat";
  }, [params?.sessionLabel]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconButton} onPress={() => navigation.goBack()}>
          <Text style={styles.headerIcon}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {sessionTitle}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.statusText}>Online</Text>
          </View>
        </View>
        <Pressable style={styles.headerIconButton}>
          <Text style={styles.headerIcon}>⚙</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.messagesContent} style={styles.messagesArea}>
        {mockMessages.map((message) => {
          const isAssistant = message.role === "assistant";
          return (
            <View
              key={message.id}
              style={[styles.messageRow, isAssistant ? styles.messageRowLeft : styles.messageRowRight]}
            >
              {isAssistant ? (
                <View style={[styles.avatar, styles.avatarAssistant]}>
                  <Text style={styles.avatarText}>{initialsForAuthor(message.author)}</Text>
                </View>
              ) : null}
              <View style={[styles.messageColumn, isAssistant ? styles.messageColumnLeft : styles.messageColumnRight]}>
                <View style={styles.metaRow}>
                  {isAssistant ? <Text style={styles.metaAuthor}>{message.author}</Text> : null}
                  <Text style={styles.metaTime}>{message.time}</Text>
                  {!isAssistant ? <Text style={styles.metaAuthor}>{message.author}</Text> : null}
                </View>
                <View style={[styles.bubble, isAssistant ? styles.assistantBubble : styles.userBubble]}>
                  <Text style={[styles.bubbleText, isAssistant ? styles.assistantBubbleText : styles.userBubbleText]}>
                    {message.body}
                  </Text>
                </View>
                {message.code ? (
                  <View style={styles.codeCard}>
                    <View style={styles.codeHeader}>
                      <Text style={styles.codeFile}>{message.code.fileName}</Text>
                      <Text style={styles.codeLanguage}>{message.code.language}</Text>
                    </View>
                    <Text style={styles.codeText}>{message.code.snippet}</Text>
                  </View>
                ) : null}
              </View>
              {!isAssistant ? (
                <View style={[styles.avatar, styles.avatarUser]}>
                  <Text style={styles.avatarText}>{initialsForAuthor(message.author)}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickActionsWrap}
        >
          {quickActions.map((action) => (
            <Pressable key={action.id} style={styles.quickAction}>
              <Text style={styles.quickActionText}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputWrap}>
          <Pressable style={styles.inputIconButton}>
            <Text style={styles.inputIcon}>＋</Text>
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message OpenClaw..."
            placeholderTextColor="#71717A"
            style={styles.textInput}
            multiline
          />
          <Pressable style={styles.sendButton}>
            <Text style={styles.sendButtonText}>↑</Text>
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>OpenClaw can make mistakes. Verify important info.</Text>
      </View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#09090B",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#27272A",
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
    backgroundColor: "#111114",
    borderWidth: 1,
    borderColor: "#27272A",
  },
  headerIcon: {
    color: "#F4F4F5",
    fontSize: 16,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 10,
  },
  headerTitle: {
    color: "#FAFAFA",
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
    color: "#A1A1AA",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  messagesArea: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 140,
    gap: 22,
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
    backgroundColor: "#1A1A20",
    borderColor: "#3F3F46",
  },
  avatarUser: {
    backgroundColor: "#10233F",
    borderColor: "#1E3A8A",
  },
  avatarText: {
    color: "#FAFAFA",
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
    color: "#A1A1AA",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  metaTime: {
    color: "#71717A",
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
    backgroundColor: "#18181B",
    borderColor: "#27272A",
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
    color: "#F4F4F5",
  },
  userBubbleText: {
    color: "#FFFFFF",
  },
  codeCard: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#3F3F46",
    backgroundColor: "#18181B",
  },
  codeHeader: {
    backgroundColor: "#111114",
    borderBottomWidth: 1,
    borderBottomColor: "#27272A",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  codeFile: {
    color: "#A1A1AA",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  codeLanguage: {
    color: "#71717A",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    textTransform: "uppercase",
  },
  codeText: {
    color: "#D4D4D8",
    fontFamily: "Courier",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: "#27272A",
    backgroundColor: "rgba(9, 9, 11, 0.96)",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  quickActionsWrap: {
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  quickAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3F3F46",
    backgroundColor: "#18181B",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickActionText: {
    color: "#E4E4E7",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  inputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3F3F46",
    backgroundColor: "#18181B",
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  inputIconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  inputIcon: {
    color: "#A1A1AA",
    fontSize: 20,
    lineHeight: 24,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 34,
    color: "#FAFAFA",
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 6,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  disclaimer: {
    marginTop: 8,
    textAlign: "center",
    color: "#71717A",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
  },
});
