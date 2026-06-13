/** Собирает текст из results — одинаково на iOS, Android и desktop Chrome. */
export function buildTranscriptFromResults(results: SpeechRecognitionResultList): string {
  let finals = "";
  let interim = "";

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const piece = result[0]?.transcript ?? "";
    if (!piece) continue;
    if (result.isFinal) {
      finals += piece;
    } else if (i === results.length - 1) {
      interim = piece;
    }
  }

  return (finals + interim).replace(/\s+/g, " ").trim();
}

/** Сколько раз перезапускать recognition, если сессия оборвалась при зажатой кнопке. */
export function getMicRestartLimit(): number {
  if (typeof navigator === "undefined") return 6;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ? 4
    : 8;
}
