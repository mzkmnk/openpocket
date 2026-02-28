import { Platform } from "react-native";
import * as Clipboard from "expo-clipboard";

export async function copyText(content: string): Promise<boolean> {
  const g = globalThis as any;
  try {
    if (Platform.OS === "web" && g.navigator?.clipboard?.writeText) {
      await g.navigator.clipboard.writeText(content);
      return true;
    }

    await Clipboard.setStringAsync(content);
    return true;
  } catch {
    return false;
  }
}
