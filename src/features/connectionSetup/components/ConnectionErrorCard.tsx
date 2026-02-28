import { Pressable, Text, View } from "react-native";

import type { UiConnectionError } from "../types";
import { styles } from "../styles";

type ConnectionErrorCardProps = Readonly<{
  error: UiConnectionError;
  onReconnect: () => void;
}>;

function breakLongUnspacedText(value: string): string {
  return value.replace(/(\S{32})(?=\S)/g, "$1\u200b");
}

function compactMessage(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 220)}...`;
}

export function ConnectionErrorCard({ error, onReconnect }: ConnectionErrorCardProps) {
  const isPairingRequired = error.category === "PAIRING_REQUIRED";

  return (
    <View style={styles.errorCard}>
      <Text style={styles.errorTitle}>Connection Error ({error.category})</Text>
      {error.code ? <Text style={styles.caption}>Code: {error.code}</Text> : null}
      <Text style={styles.errorBody} numberOfLines={isPairingRequired ? 3 : 2} ellipsizeMode="tail">
        {breakLongUnspacedText(compactMessage(error.message))}
      </Text>

      {isPairingRequired ? (
        <View style={styles.pairingCard}>
          <Text style={styles.pairingTitle}>Pairing approval required</Text>
          <Text style={styles.pairingBody} numberOfLines={3}>
            Approval is required on the host side (Control UI/CLI) before this device can connect.
          </Text>
          <Pressable style={styles.reconnectButton} onPress={onReconnect}>
            <Text style={styles.reconnectButtonText}>Reconnect</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
