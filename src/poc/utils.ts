import type { ChatMessage, SessionItem } from "./types";

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") {
    return null;
  }
  return v as Record<string, unknown>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
}

export function extractMessageText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (!input) {
    return "";
  }

  if (Array.isArray(input)) {
    return input.map(extractMessageText).filter(Boolean).join("\n");
  }

  const rec = asRecord(input);
  if (!rec) {
    return "";
  }

  const candidates = [
    rec.text,
    rec.delta,
    rec.content,
    rec.message,
    rec.output,
    rec.value,
    rec.parts,
    rec.blocks,
    rec.data,
  ];

  const texts = candidates.map(extractMessageText).filter(Boolean);
  return texts.join("\n");
}

export function extractSessionItems(payload: unknown): SessionItem[] {
  const root = asRecord(payload);
  const list = Array.isArray(root?.sessions)
    ? root.sessions
    : Array.isArray(root?.items)
      ? root.items
      : Array.isArray(payload)
        ? payload
        : [];

  return list
    .map((raw) => {
      const item = asRecord(raw);
      if (!item || typeof item.key !== "string") {
        return null;
      }
      return {
        key: item.key,
        label: typeof item.label === "string" ? item.label : undefined,
        updatedAt:
          typeof item.updatedAt === "string" || typeof item.updatedAt === "number"
            ? item.updatedAt
            : undefined,
      } satisfies SessionItem;
    })
    .filter((item): item is SessionItem => item !== null);
}

export function extractHistoryMessages(payload: unknown): ChatMessage[] {
  const root = asRecord(payload);
  const list = Array.isArray(root?.messages)
    ? root.messages
    : Array.isArray(payload)
      ? payload
      : [];

  return list
    .map((raw, idx) => {
      const item = asRecord(raw);
      if (!item) {
        return null;
      }

      const role =
        item.role === "assistant" || item.role === "system" || item.role === "tool"
          ? item.role
          : "user";

      const text = extractMessageText(item);
      if (!text) {
        return null;
      }

      return {
        id: typeof item.id === "string" ? item.id : `hist_${idx}_${Date.now()}`,
        role,
        text,
        runId: typeof item.runId === "string" ? item.runId : undefined,
      } satisfies ChatMessage;
    })
    .filter((item): item is ChatMessage => item !== null);
}
