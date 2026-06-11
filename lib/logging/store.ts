import type { TechLogEntry } from "./types";

export const TECH_LOG_STORAGE_KEY = "kizer-tech-logs";
const MAX_ENTRIES = 2500;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readStoredLogs(): TechLogEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(TECH_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TechLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStoredLogs(entries: TechLogEntry[]): void {
  if (!isBrowser()) return;
  try {
    const trimmed = entries.slice(0, MAX_ENTRIES);
    localStorage.setItem(TECH_LOG_STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent("kizer-tech-log-updated", { detail: { count: trimmed.length } }));
  } catch (error) {
    console.warn("Failed to persist tech logs:", error);
  }
}

export function prependStoredLog(entry: TechLogEntry): TechLogEntry[] {
  const next = [entry, ...readStoredLogs()].slice(0, MAX_ENTRIES);
  writeStoredLogs(next);
  return next;
}

export function clearStoredLogs(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(TECH_LOG_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("kizer-tech-log-updated", { detail: { count: 0 } }));
}

export function exportStoredLogsJson(): string {
  return JSON.stringify(readStoredLogs(), null, 2);
}

export function getStoredLogCount(): number {
  return readStoredLogs().length;
}
