export type RootStackParamList = {
  "auth/gate": undefined;
  "auth/login": undefined;
  "internal/sessions": undefined;
  "internal/chat": {
    sessionKey?: string;
    sessionLabel?: string;
  };
};
