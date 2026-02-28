import type { GatewayConnectionStatus } from "../../core/gateway/types";

export type AuthMode = "token" | "none";

export type ErrorCategory = "AUTH" | "PAIRING_REQUIRED" | "INVALID_REQUEST" | "NETWORK" | "UNKNOWN";

export type UiConnectionError = {
  category: ErrorCategory;
  code?: string;
  message: string;
};

export type StatusAppearance = {
  label: string;
  dotColor: string;
  textColor: string;
  borderColor: string;
  backgroundColor: string;
};

export type StatusCardModel = {
  current: GatewayConnectionStatus;
  previous: GatewayConnectionStatus;
  detail: string;
};
