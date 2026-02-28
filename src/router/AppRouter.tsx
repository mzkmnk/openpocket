import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AuthGateScreen } from "../screens/auth/AuthGateScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { ChatScreen } from "../screens/internal/ChatScreen";
import { SessionsScreen } from "../screens/internal/SessionsScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

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
        <Stack.Screen name="internal/sessions" component={SessionsScreen} />
        <Stack.Screen name="internal/chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
