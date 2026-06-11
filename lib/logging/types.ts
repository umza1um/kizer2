export type TechLogLevel = "debug" | "info" | "warn" | "error";

export type TechLogCategory =
  | "system"
  | "navigation"
  | "api"
  | "speech"
  | "tts"
  | "ui"
  | "settings"
  | "error"
  | "performance";

export type TechLogAccounts = Record<string, string | boolean | number | null>;

export type TechLogEntry = {
  id: string;
  ts: string;
  tsLocal: string;
  level: TechLogLevel;
  category: TechLogCategory;
  action: string;
  message?: string;
  urls?: string[];
  accounts?: TechLogAccounts;
  durationMs?: number;
  path?: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
};

export type TechLogInput = {
  level?: TechLogLevel;
  category: TechLogCategory;
  action: string;
  message?: string;
  urls?: string[];
  accounts?: TechLogAccounts;
  durationMs?: number;
  path?: string;
  metadata?: Record<string, unknown>;
};

export type TechLogFilter = {
  level?: TechLogLevel | "all";
  category?: TechLogCategory | "all";
  query?: string;
};
