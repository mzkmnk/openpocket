import { Text, View } from "react-native";

import type { StatusCardModel } from "../types";
import { styles } from "../styles";
import { getStatusAppearance } from "../utils";

type ConnectionStatusCardProps = Readonly<{
  model: StatusCardModel;
}>;

function compactStatusDetail(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 140)}...`;
}

function breakLongUnspacedText(value: string): string {
  return value.replace(/(\S{24})(?=\S)/g, "$1\u200b");
}

export function ConnectionStatusCard({ model }: ConnectionStatusCardProps) {
  const current = getStatusAppearance(model.current);
  const previous = getStatusAppearance(model.previous);

  return (
    <View style={styles.statusStack}>
      <View
        style={[
          styles.statusCard,
          {
            borderColor: current.borderColor,
            backgroundColor: current.backgroundColor,
          },
        ]}
      >
        <View style={styles.statusRow}>
          <Text style={styles.statusTitle}>Current Status</Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: current.dotColor }]} />
            <Text style={[styles.statusValue, { color: current.textColor }]} numberOfLines={1}>
              {" "}
              {current.label}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.caption, styles.statusDetailText]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {breakLongUnspacedText(compactStatusDetail(model.detail))}
        </Text>
      </View>

      <View style={[styles.statusCard, styles.previousCard]}>
        <View style={styles.statusRow}>
          <Text style={styles.statusTitle}>Previous State</Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: "#9ca3af" }]} />
            <Text style={styles.previousStateValue} numberOfLines={1}>
              {" "}
              {previous.label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
