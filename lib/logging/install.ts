import { extractUrls, getRuntimeAccountsSnapshot, summarizeBody } from "./context";
import { techLog, techLogSystemBoot } from "./logger";
import type { TtsSettings } from "../tts/settings";

let fetchPatched = false;

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readResponsePreview(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("audio/") || contentType.includes("octet-stream")) {
    return { contentType, note: "binary body skipped" };
  }

  try {
    const clone = response.clone();
    const text = await clone.text();
    if (!text) return null;
    if (text.length > 4000) {
      return { length: text.length, preview: text.slice(0, 400) + "…" };
    }
    return safeJsonParse(text);
  } catch {
    return { note: "response body unreadable" };
  }
}

export function installFetchLogger(): void {
  if (typeof window === "undefined" || fetchPatched) return;
  fetchPatched = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    let requestBodySummary: Record<string, unknown> | undefined;
    if (init?.body) {
      requestBodySummary = summarizeBody(init.body);
    }

    techLog({
      level: "info",
      category: "api",
      action: "fetch.start",
      message: `${method} ${url}`,
      urls: [url, ...extractUrls(requestBodySummary)],
      accounts: getRuntimeAccountsSnapshot(),
      metadata: {
        method,
        requestBody: requestBodySummary,
      },
    });

    try {
      const response = await nativeFetch(input, init);
      const durationMs = Math.round(performance.now() - started);
      const responsePreview = await readResponsePreview(response);

      techLog({
        level: response.ok ? "info" : "warn",
        category: "api",
        action: "fetch.complete",
        message: `${method} ${url} → ${response.status}`,
        urls: [url, ...extractUrls(responsePreview)],
        durationMs,
        accounts: getRuntimeAccountsSnapshot(),
        metadata: {
          method,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          response: responsePreview,
        },
      });

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      techLog({
        level: "error",
        category: "api",
        action: "fetch.error",
        message: `${method} ${url} failed`,
        urls: [url],
        durationMs,
        accounts: getRuntimeAccountsSnapshot(),
        metadata: {
          method,
          error: error instanceof Error ? error.message : String(error),
        },
      });
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
      accounts: getRuntimeAccountsSnapshot(),
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
        reason,
      },
    });
  });
}

export function installTechLogging(): void {
  installFetchLogger();
  installGlobalErrorLogger();
  techLogSystemBoot();
}
