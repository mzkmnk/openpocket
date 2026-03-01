import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { InternalFooterNav } from "../features/navigation/InternalFooterNav";
import { AuthGateScreen } from "../screens/auth/AuthGateScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { AccountScreen } from "../screens/internal/AccountScreen";
import { ChatScreen } from "../screens/internal/ChatScreen";
import { SessionCreateScreen } from "../screens/internal/SessionCreateScreen";
import { SessionSettingsScreen } from "../screens/internal/SessionSettingsScreen";
import { SessionsScreen } from "../screens/internal/SessionsScreen";
import type { InternalTabParamList, RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<InternalTabParamList>();

function InternalTabs() {
  return (
    <Tab.Navigator
      initialRouteName="sessions"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#FFFFFF" },
      }}
      tabBar={(props) => <InternalFooterNav {...props} />}
    >
      <Tab.Screen name="sessions" component={SessionsScreen} />
      <Tab.Screen name="account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export function AppRouter() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="auth/gate"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#05050A" },
        }}
      >
        <Stack.Screen name="auth/gate" component={AuthGateScreen} />
        <Stack.Screen name="auth/login" component={LoginScreen} />
        <Stack.Screen name="internal/main" component={InternalTabs} />
        <Stack.Screen name="internal/chat" component={ChatScreen} />
        <Stack.Screen name="internal/session-settings" component={SessionSettingsScreen} />
        <Stack.Screen name="internal/session-create" component={SessionCreateScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
