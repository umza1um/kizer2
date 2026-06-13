import { extractUrls, summarizeBody } from "./context";
import { techLog, techLogSystemBoot } from "./logger";
import type { TtsSettings } from "../tts/settings";

let fetchPatched = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function shouldSkipFetchLog(url: string): boolean {
  return url.includes("/_next/") || url.includes("/favicon");
}

function isTtsSpeakUrl(url: string): boolean {
  return url.includes("/api/tts/speak");
}

export function installFetchLogger(): void {
  if (typeof window === "undefined" || fetchPatched) return;
  fetchPatched = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = requestUrl(input);
    const skip = shouldSkipFetchLog(url);
    const isTts = isTtsSpeakUrl(url);

    try {
      const response = await nativeFetch(input, init);
      const durationMs = Math.round(performance.now() - started);

      if (!skip && (!response.ok || !isTts)) {
        techLog({
          level: response.ok ? "debug" : "warn",
          category: "api",
          action: "fetch.complete",
          message: `${method} ${url} → ${response.status}`,
          urls: [url],
          durationMs,
          metadata: {
            method,
            status: response.status,
            ok: response.ok,
          },
        });
      }

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      if (!skip) {
        let requestBodySummary: Record<string, unknown> | undefined;
        if (init?.body) {
          requestBodySummary = summarizeBody(init.body);
        }

        techLog({
          level: "error",
          category: "api",
          action: "fetch.error",
          message: `${method} ${url} failed`,
          urls: [url, ...extractUrls(requestBodySummary)],
          durationMs,
          metadata: {
            method,
            error: error instanceof Error ? error.message : String(error),
            requestBody: requestBodySummary,
          },
        });
      }
      throw error;
    }
  };
}

export function installGlobalErrorLogger(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("kizer-tts-settings-saved", (event) => {
    const detail = (event as CustomEvent<TtsSettings>).detail;
    techLog({
      level: "info",
      category: "settings",
      action: "tts.save",
      metadata: detail,
    });
  });

  window.addEventListener("error", (event) => {
    techLog({
      level: "error",
      category: "error",
      action: "window.error",
      message: event.message,
      urls: event.filename ? [event.filename] : undefined,
      metadata: {
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    techLog({
      level: "error",
      category: "error",
      action: "unhandledrejection",
      message: reason instanceof Error ? reason.message : String(reason),
      metadata: {
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    });
  });
}

export function installTechLogging(): void {
  installFetchLogger();
  installGlobalErrorLogger();
  techLogSystemBoot();
}
