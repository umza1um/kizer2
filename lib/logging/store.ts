import type { TechLogEntry } from "./types";

export const TECH_LOG_STORAGE_KEY = "kizer-tech-logs";
const MAX_ENTRIES = 2500;
const FLUSH_MS = 800;

let memoryBuffer: TechLogEntry[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadFromDisk(): TechLogEntry[] {
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

function getBuffer(): TechLogEntry[] {
  if (memoryBuffer === null) {
    memoryBuffer = loadFromDisk();
  }
  return memoryBuffer;
}

function flushToDisk(): void {
  if (!isBrowser() || memoryBuffer === null) return;
  try {
    const trimmed = memoryBuffer.slice(0, MAX_ENTRIES);
    localStorage.setItem(TECH_LOG_STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(
      new CustomEvent("kizer-tech-log-updated", { detail: { count: trimmed.length } }),
    );
  } catch (error) {
    console.warn("Failed to persist tech logs:", error);
  }
}

function scheduleFlush(): void {
  if (!isBrowser()) return;
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToDisk();
  }, FLUSH_MS);
}

export function readStoredLogs(): TechLogEntry[] {
  return [...getBuffer()];
}

export function writeStoredLogs(entries: TechLogEntry[]): void {
  if (!isBrowser()) return;
  memoryBuffer = entries.slice(0, MAX_ENTRIES);
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushToDisk();
}

export function prependStoredLog(entry: TechLogEntry): TechLogEntry[] {
  const next = [entry, ...getBuffer()].slice(0, MAX_ENTRIES);
  memoryBuffer = next;
  scheduleFlush();
  return next;
}

export function clearStoredLogs(): void {
  if (!isBrowser()) return;
  memoryBuffer = [];
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  localStorage.removeItem(TECH_LOG_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("kizer-tech-log-updated", { detail: { count: 0 } }));
}

export function exportStoredLogsJson(): string {
  return JSON.stringify(getBuffer(), null, 2);
}

export function getStoredLogCount(): number {
  return getBuffer().length;
}
