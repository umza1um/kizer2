import { getRuntimeAccountsSnapshot } from "./context";
import { getSessionId } from "./session";
import { prependStoredLog, readStoredLogs } from "./store";
import type { TechLogEntry, TechLogFilter, TechLogInput, TechLogLevel } from "./types";

const LEVEL_WEIGHT: Record<TechLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: TechLogLevel = "debug";
let installed = false;

function formatLocalTime(date: Date): string {
  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function createId(): string {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname + window.location.search;
}

export function setTechLogMinLevel(level: TechLogLevel): void {
  minLevel = level;
}

export function techLog(input: TechLogInput): TechLogEntry | null {
  if (typeof window === "undefined") return null;
  if (LEVEL_WEIGHT[input.level ?? "info"] < LEVEL_WEIGHT[minLevel]) return null;

  const now = new Date();
  const entry: TechLogEntry = {
    id: createId(),
    ts: now.toISOString(),
    tsLocal: formatLocalTime(now),
    level: input.level ?? "info",
    category: input.category,
    action: input.action,
    message: input.message,
    urls: input.urls?.filter(Boolean),
    accounts: input.accounts,
    durationMs: input.durationMs,
    path: input.path ?? currentPath(),
    sessionId: getSessionId(),
    metadata: input.metadata,
  };

  prependStoredLog(entry);
  return entry;
}

export function techLogSystemBoot(): void {
  if (installed) return;
  installed = true;

  techLog({
    level: "info",
    category: "system",
    action: "session.start",
    message: "Технический лог инициализирован",
    accounts: getRuntimeAccountsSnapshot(),
    metadata: {
      screen: typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : null,
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    },
  });
}

export function getTechLogs(filter?: TechLogFilter): TechLogEntry[] {
  let entries = readStoredLogs();
  if (!filter) return entries;

  if (filter.level && filter.level !== "all") {
    entries = entries.filter((e) => e.level === filter.level);
  }
  if (filter.category && filter.category !== "all") {
    entries = entries.filter((e) => e.category === filter.category);
  }
  if (filter.query?.trim()) {
    const q = filter.query.trim().toLowerCase();
    entries = entries.filter((entry) => {
      const haystack = [
        entry.action,
        entry.message,
        entry.category,
        entry.level,
        entry.path,
        JSON.stringify(entry.urls ?? []),
        JSON.stringify(entry.accounts ?? {}),
        JSON.stringify(entry.metadata ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return entries;
}

export { clearStoredLogs, exportStoredLogsJson, getStoredLogCount } from "./store";
