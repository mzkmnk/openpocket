import { Pressable, Text, TextInput, View } from "react-native";

import type { GatewayConnectionStatus } from "../../../core/gateway/types";

import { styles } from "../styles";

type ConnectionFormCardProps = Readonly<{
  gatewayUrl: string;
  token: string;
  showToken: boolean;
  gatewayUrlError: string;
  tokenError: string;
  status: GatewayConnectionStatus;
  onGatewayUrlChange: (next: string) => void;
  onTokenChange: (next: string) => void;
  onToggleShowToken: () => void;
  onConnect: () => void;
  onClear: () => void;
}>;

export function ConnectionFormCard({
  gatewayUrl,
  token,
  showToken,
  gatewayUrlError,
  tokenError,
  status,
  onGatewayUrlChange,
  onTokenChange,
  onToggleShowToken,
  onConnect,
  onClear,
}: ConnectionFormCardProps) {
  const isBusy = status === "connecting" || status === "reconnecting";

  return (
    <View style={styles.card}>
      <Text style={styles.label}>WSS URL</Text>
      <TextInput
        value={gatewayUrl}
        onChangeText={onGatewayUrlChange}
        placeholder="wss://example.com/ws"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, gatewayUrlError ? styles.inputError : null]}
      />
      {gatewayUrlError ? <Text style={styles.errorText}>{gatewayUrlError}</Text> : null}
      <Text style={styles.caption}>Use a secure WebSocket endpoint (wss://)</Text>

      <Text style={styles.label}>Access Token</Text>
      <View style={styles.row}>
        <TextInput
          value={token}
          onChangeText={onTokenChange}
          placeholder="Enter your token"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showToken}
          style={[styles.input, styles.tokenInput, tokenError ? styles.inputError : null]}
        />
        <Pressable style={styles.toggle} onPress={onToggleShowToken}>
          <Text style={styles.toggleText}>{showToken ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>
      {tokenError ? <Text style={styles.errorText}>{tokenError}</Text> : null}
      <Text style={styles.caption}>
        Token is stored locally and never displayed in plain text by default.
      </Text>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.button, styles.primaryButton, isBusy ? styles.buttonDisabled : null]}
          onPress={onConnect}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>{isBusy ? "Connecting..." : "Connect"}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={onClear}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}
