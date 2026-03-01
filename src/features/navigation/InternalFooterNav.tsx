import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

const TAB_ITEMS: readonly {
  tab: string;
  label: string;
  icon: "chat" | "account-circle";
}[] = [
  { tab: "sessions", label: "Session", icon: "chat" },
  { tab: "account", label: "Account", icon: "account-circle" },
];

export function InternalFooterNav({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      {TAB_ITEMS.map((item) => {
        const routeIndex = state.routes.findIndex((route) => route.name === item.tab);
        if (routeIndex < 0) {
          return null;
        }
        const isActive = state.index === routeIndex;
        return (
          <Pressable
            key={item.tab}
            style={[styles.tabButton, isActive ? styles.tabButtonActive : null]}
            onPress={() => {
              if (!isActive) {
                navigation.navigate(item.tab);
              }
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <MaterialIcons name={item.icon} size={20} color={isActive ? "#137FEC" : "#64748B"} />
            <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    minHeight: 46,
    paddingVertical: 8,
    gap: 2,
  },
  tabButtonActive: {
    backgroundColor: "#EFF6FF",
  },
  tabLabel: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: "SpaceGrotesk_500Medium",
  },
  tabLabelActive: {
    color: "#0B61C0",
    fontFamily: "SpaceGrotesk_700Bold",
  },
});
