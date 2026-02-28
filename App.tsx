import { useFonts, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

import "./global.css";

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-lg text-slate-900" style={{ fontFamily: "SpaceGrotesk_700Bold" }}>
        openpocket is ready.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}
