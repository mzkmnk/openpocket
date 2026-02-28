import { SafeAreaView, Text, View } from "react-native";

export function SessionsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#05050A" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "700" }}>Sessions</Text>
        <Text style={{ color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
          internal/sessions route is ready. Replace this with your session list UI.
        </Text>
      </View>
    </SafeAreaView>
  );
}
