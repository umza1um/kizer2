import { isMobileDevice } from "../tts/platform";

export type TranscriptStrategy = "mobile" | "desktop";

function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Какую стратегию использовать в текущем браузере. */
export function resolveTranscriptStrategy(): TranscriptStrategy {
  return isMobileDevice() ? "mobile" : "desktop";
}

/**
 * Android/iOS Chrome: каждый refinement приходит как новый isFinal
 * с полной кумулятивной фразой. Берём самый длинный transcript.
 */
export function buildMobileTranscript(results: SpeechRecognitionResultList): string {
  let best = "";
  for (let i = 0; i < results.length; i += 1) {
    const piece = results[i]?.[0]?.transcript ?? "";
    if (piece.length >= best.length) {
      best = piece;
    }
  }
  return normalizeTranscript(best);
}

function combineFinalsAndInterim(finals: string, interim: string): string {
  const f = finals;
  const inter = interim.trim();
  if (!f) return normalizeTranscript(inter);
  if (!inter) return normalizeTranscript(f);
  if (inter.startsWith(f.trim())) return normalizeTranscript(inter);
  return normalizeTranscript(f + interim);
}

/**
 * Desktop Chrome: isFinal-сегменты — дельты. Склеиваем все final + последний interim.
 */
export function buildDesktopTranscriptFull(results: SpeechRecognitionResultList): string {
  let finals = "";
  let interim = "";

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const piece = result[0]?.transcript ?? "";
    if (!piece) continue;
    if (result.isFinal) {
      finals += piece;
    } else {
      interim = piece;
    }
  }

  return combineFinalsAndInterim(finals, interim);
}

/**
 * Desktop: инкрементальное дополнение с resultIndex (для onresult).
 * `accumulated` — уже принятые final-сегменты до текущего event.
 */
export function appendDesktopTranscript(
  accumulated: string,
  results: SpeechRecognitionResultList,
  resultIndex: number,
): string {
  let finals = accumulated;
  let interim = "";

  const from = Math.max(0, Math.min(resultIndex, results.length));
  for (let i = from; i < results.length; i += 1) {
    const result = results[i];
    const piece = result[0]?.transcript ?? "";
    if (!piece) continue;
    if (result.isFinal) {
      finals += piece;
    } else {
      interim = piece;
    }
  }

  return combineFinalsAndInterim(finals, interim);
}

export type BuildTranscriptOptions = {
  strategy?: TranscriptStrategy;
  /** Только desktop: уже накопленные final-сегменты. */
  accumulated?: string;
};

/**
 * Собирает отображаемый текст из SpeechRecognitionEvent.
 */
export function buildTranscriptFromEvent(
  results: SpeechRecognitionResultList,
  resultIndex = 0,
  options?: BuildTranscriptOptions,
): string {
  const strategy = options?.strategy ?? resolveTranscriptStrategy();

  if (strategy === "mobile") {
    return buildMobileTranscript(results);
  }

  if (options?.accumulated !== undefined) {
    return appendDesktopTranscript(options.accumulated, results, resultIndex);
  }

  return buildDesktopTranscriptFull(results);
}

/** @deprecated Используйте buildTranscriptFromEvent(results, resultIndex). */
export function buildTranscriptFromResults(
  results: SpeechRecognitionResultList,
  resultIndex = 0,
  options?: BuildTranscriptOptions,
): string {
  return buildTranscriptFromEvent(results, resultIndex, options);
}

/**
 * После перезапуска recognition при зажатой кнопке — объединить сессии без дублей.
 */
export function mergeTranscriptOnRestart(previous: string, current: string): string {
  const prev = normalizeTranscript(previous);
  const cur = normalizeTranscript(current);
  if (!prev) return cur;
  if (!cur) return prev;
  if (cur.startsWith(prev)) return cur;
  if (prev.startsWith(cur)) return prev;
  if (prev.endsWith(cur)) return prev;
  if (cur.endsWith(prev)) return cur;
  return normalizeTranscript(`${prev} ${cur}`);
}

/** Сколько раз перезапускать recognition, если сессия оборвалась при зажатой кнопке. */
export function getMicRestartLimit(): number {
  if (typeof navigator === "undefined") return 6;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ? 4
    : 8;
}
