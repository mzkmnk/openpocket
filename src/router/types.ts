import type { NavigatorScreenParams } from "@react-navigation/native";

export type InternalTabParamList = {
  sessions: undefined;
  account: undefined;
};

export type RootStackParamList = {
  "auth/gate": undefined;
  "auth/login": undefined;
  "internal/main": NavigatorScreenParams<InternalTabParamList> | undefined;
  "internal/chat": {
    sessionKey?: string;
    sessionLabel?: string;
    sessionModel?: string;
  };
};
