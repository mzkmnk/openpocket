export type RootStackParamList = {
  "auth/login": undefined;
  "internal/sessions": undefined;
  "internal/chat": {
    sessionKey?: string;
    sessionLabel?: string;
  };
};
