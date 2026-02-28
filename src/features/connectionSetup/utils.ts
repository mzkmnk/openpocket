import type { GatewayConnectionStatus } from "../../core/gateway/types";

import type { AuthMode, StatusAppearance, UiConnectionError } from "./types";

export function isValidWssUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "wss:" && parsed.host.length > 0;
  } catch {
    return false;
  }
}

export function normalizeErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return "Unknown error";
}

export function classifyError(error: unknown): UiConnectionError {
  const message = normalizeErrorMessage(error);
  const code =
    error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code ?? undefined)
      : undefined;
  const haystack = `${code ?? ""} ${message}`.toUpperCase();

  if (haystack.includes("PAIRING_REQUIRED")) {
    return { category: "PAIRING_REQUIRED", code, message };
  }

  if (
    haystack.includes("AUTH") ||
    haystack.includes("TOKEN") ||
    haystack.includes("UNAUTHORIZED") ||
    haystack.includes("FORBIDDEN")
  ) {
    return { category: "AUTH", code, message };
  }

  if (haystack.includes("INVALID_REQUEST") || haystack.includes("VALIDATION")) {
    return { category: "INVALID_REQUEST", code, message };
  }

  if (
    haystack.includes("SOCKET") ||
    haystack.includes("NETWORK") ||
    haystack.includes("WEBSOCKET")
  ) {
    return { category: "NETWORK", code, message };
  }

  return { category: "UNKNOWN", code, message };
}

export function getStatusAppearance(status: GatewayConnectionStatus): StatusAppearance {
  switch (status) {
    case "connected":
      return {
        label: "Connected",
        dotColor: "#10b981",
        textColor: "#047857",
        borderColor: "#a7f3d0",
        backgroundColor: "#ecfdf5",
      };
    case "connecting":
      return {
        label: "Connecting...",
        dotColor: "#2563eb",
        textColor: "#1d4ed8",
        borderColor: "#bfdbfe",
        backgroundColor: "#eff6ff",
      };
    case "reconnecting":
      return {
        label: "Reconnecting...",
        dotColor: "#f59e0b",
        textColor: "#b45309",
        borderColor: "#fde68a",
        backgroundColor: "#fffbeb",
      };
    case "error":
      return {
        label: "Error",
        dotColor: "#ef4444",
        textColor: "#b91c1c",
        borderColor: "#fecaca",
        backgroundColor: "#fef2f2",
      };
    default:
      return {
        label: "Disconnected",
        dotColor: "#94a3b8",
        textColor: "#475569",
        borderColor: "#cbd5e1",
        backgroundColor: "#f8fafc",
      };
  }
}

export function validateFields(
  gatewayUrl: string,
  token: string,
  authMode: AuthMode,
): { gatewayUrlError: string; tokenError: string } {
  const normalizedUrl = gatewayUrl.trim();
  const normalizedToken = token.trim();

  return {
    gatewayUrlError: isValidWssUrl(normalizedUrl)
      ? ""
      : "Please enter a valid secure WebSocket URL (wss://)",
    tokenError:
      authMode === "token" && normalizedToken.length === 0 ? "Token is required in token mode" : "",
  };
}
