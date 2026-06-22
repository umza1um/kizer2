import { loadTtsSettings } from "../tts/settings";
import type { TechLogAccounts } from "./types";

function envFlag(name: string): string {
  if (typeof process === "undefined") return "unknown";
  const value = process.env[name];
  if (!value) return "unset";
  return "set";
}

export function getRuntimeAccountsSnapshot(): TechLogAccounts {
  const accounts: TechLogAccounts = {
    hostname: typeof window !== "undefined" ? window.location.hostname : null,
    origin: typeof window !== "undefined" ? window.location.origin : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    platform: typeof navigator !== "undefined" ? navigator.platform : null,
    language: typeof navigator !== "undefined" ? navigator.language : null,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    envOpenAiKey: envFlag("OPENAI_API_KEY"),
    envAzureKey: envFlag("AZURE_SPEECH_KEY"),
    envSerpApiKey: envFlag("SERPAPI_API_KEY"),
    envGoogleCseKey: envFlag("GOOGLE_CSE_API_KEY"),
    envGoogleCseCx: envFlag("GOOGLE_CSE_CX"),
    envPublicBaseUrl: envFlag("PUBLIC_BASE_URL"),
    envTtsProvider: envFlag("NEXT_PUBLIC_TTS_PROVIDER"),
  };

  if (typeof window !== "undefined") {
    try {
      const tts = loadTtsSettings();
      accounts.ttsProvider = tts.provider;
      accounts.ttsOpenAiVoice = tts.openAiVoice;
      accounts.ttsAzureVoice = tts.azureVoice;
      accounts.ttsSpeechSpeed = tts.speechSpeed;
      accounts.ttsBrowserVoiceUri = tts.browserVoiceUri || "(auto)";
    } catch {
      accounts.ttsProvider = "load-error";
    }
  }

  return accounts;
}

export function extractUrls(value: unknown): string[] {
  const found = new Set<string>();

  const visit = (input: unknown) => {
    if (typeof input === "string") {
      const httpMatches = input.match(/https?:\/\/[^\s"'<>]+/gi);
      httpMatches?.forEach((url) => found.add(url.replace(/[),.;]+$/, "")));
      if (input.startsWith("/api/") || input.startsWith("/")) {
        found.add(input.split(/\s/)[0] ?? input);
      }
      return;
    }
    if (Array.isArray(input)) {
      input.forEach(visit);
      return;
    }
    if (input && typeof input === "object") {
      Object.values(input).forEach(visit);
    }
  };

  visit(value);
  return [...found];
}

export function summarizeBody(body: unknown): Record<string, unknown> | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") {
    if (body.startsWith("data:image")) {
      return { type: "data-url", length: body.length, preview: body.slice(0, 40) + "…" };
    }
    if (body.length > 500) {
      return { type: "text", length: body.length, preview: body.slice(0, 200) + "…" };
    }
    try {
      return { type: "json-string", parsed: JSON.parse(body) };
    } catch {
      return { type: "text", preview: body };
    }
  }
  if (typeof body === "object") {
    const json = JSON.stringify(body);
    if (json.includes("data:image") || json.length > 2000) {
      return { type: "object", length: json.length, keys: Object.keys(body as object) };
    }
    return body as Record<string, unknown>;
  }
  return { value: String(body) };
}
