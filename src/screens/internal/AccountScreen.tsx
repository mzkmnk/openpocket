import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

type AccountAction = Readonly<{
  icon: "shield" | "notifications-none" | "help-outline";
  title: string;
  body: string;
}>;

const SAMPLE_ACTIONS: readonly AccountAction[] = [
  {
    icon: "shield",
    title: "Security",
    body: "Biometric lock and token settings.",
  },
  {
    icon: "notifications-none",
    title: "Notifications",
    body: "Alerts for connection and session updates.",
  },
  {
    icon: "help-outline",
    title: "Support",
    body: "See docs and troubleshooting guides.",
  },
];

export function AccountScreen() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    MaterialIcons: require("react-native-vector-icons/Fonts/MaterialIcons.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.subtitle}>Sample page for account-related settings.</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={22} color="#0B61C0" />
          </View>
          <View style={styles.profileTextWrap}>
            <Text style={styles.profileName}>OpenPocket Operator</Text>
            <Text style={styles.profileMeta}>operator@local · role: owner</Text>
          </View>
        </View>

        <View style={styles.actionsWrap}>
          {SAMPLE_ACTIONS.map((item) => (
            <Pressable key={item.title} style={styles.actionButton}>
              <View style={styles.actionIcon}>
                <MaterialIcons name={item.icon} size={18} color="#0B61C0" />
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>{item.title}</Text>
                <Text style={styles.actionBody}>{item.body}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="#94A3B8" />
            </Pressable>
          ))}
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    color: "#0F172A",
    fontSize: 28,
    fontFamily: "SpaceGrotesk_700Bold",
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  profileCard: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FBFF",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DBEAFE",
  },
  profileTextWrap: {
    flex: 1,
  },
  profileName: {
    color: "#0F172A",
    fontSize: 15,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  profileMeta: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  actionsWrap: {
    marginTop: 14,
    gap: 8,
  },
  actionButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  actionBody: {
    marginTop: 1,
    color: "#64748B",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
  },
});
