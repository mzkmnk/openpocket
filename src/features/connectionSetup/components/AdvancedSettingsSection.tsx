import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

type AdvancedSettingsSectionProps = Readonly<{
  expanded: boolean;
  deviceInfo: string;
  notice: string;
  onToggle: () => void;
  onRegenerateIdentity: () => void;
}>;

export function AdvancedSettingsSection({
  expanded,
  deviceInfo,
  notice,
  onToggle,
  onRegenerateIdentity,
}: AdvancedSettingsSectionProps) {
  return (
    <View style={styles.advancedSection}>
      <Pressable onPress={onToggle}>
        <Text style={styles.advancedLink}>Advanced settings</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.footerCard}>
          <Text style={styles.label}>Device identity</Text>
          <Text style={styles.caption}>{deviceInfo}</Text>
          <Text style={styles.caption}>{notice}</Text>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={onRegenerateIdentity}>
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Regenerate identity</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
