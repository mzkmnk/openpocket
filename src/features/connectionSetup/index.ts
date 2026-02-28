export type { GatewayConnectionStatus } from "../../core/gateway/types";

export type {
  AuthMode,
  ErrorCategory,
  StatusAppearance,
  StatusCardModel,
  UiConnectionError,
} from "./types";

export {
  classifyError,
  getStatusAppearance,
  isValidWssUrl,
  normalizeErrorMessage,
  validateFields,
} from "./utils";

export { styles } from "./styles";

export { AdvancedSettingsSection } from "./components/AdvancedSettingsSection";
export { ConnectionErrorCard } from "./components/ConnectionErrorCard";
export { ConnectionFormCard } from "./components/ConnectionFormCard";
export { ConnectionStatusCard } from "./components/ConnectionStatusCard";
