export type VoicePickMode = "preferFemaleRu" | "anyRu";

export type BrowserTtsTuning = {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
};

export function cleanTextForSpeech(text: string): string {
  let cleaned = text;

  const sourcesIndex = cleaned.indexOf("\n\nИсточники:");
  if (sourcesIndex !== -1) {
    cleaned = cleaned.substring(0, sourcesIndex);
  }

  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, "");

  cleaned = cleaned
    .replace(/\*/g, "")
    .replace(/#/g, "")
    .replace(/_{2,}/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ");

  return cleaned;
}

/** Делит текст на фрагменты для TTS (границы предложений / абзацев). */
export function splitIntoSpeakSegments(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.length ? parts : [normalized];
}

export function pickRussianVoice(
  voices: SpeechSynthesisVoice[],
  mode: VoicePickMode = "preferFemaleRu",
): SpeechSynthesisVoice | undefined {
  const ruVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("ru"));
  if (ruVoices.length === 0) return undefined;

  if (mode === "preferFemaleRu") {
    return (
      ruVoices.find((v) => /женск|female/i.test(v.name)) ??
      ruVoices.find((v) => /irina|svetlana|milena|tatyana|anna|alena|alyona/i.test(v.name)) ??
      ruVoices[0]
    );
  }

  return ruVoices[0];
}

export function applyVoiceToUtterance(
  utterance: SpeechSynthesisUtterance,
  opts?: { mode?: VoicePickMode; voices?: SpeechSynthesisVoice[]; voiceUri?: string },
) {
  const voices =
    opts?.voices ??
    (typeof window !== "undefined" && "speechSynthesis" in window
      ? window.speechSynthesis.getVoices()
      : []);

  if (opts?.voiceUri) {
    const byUri = voices.find((v) => v.voiceURI === opts.voiceUri);
    if (byUri) {
      utterance.voice = byUri;
      return;
    }
  }

  const picked = pickRussianVoice(voices, opts?.mode ?? "preferFemaleRu");
  if (picked) utterance.voice = picked;
}

export function listRussianVoices(voices?: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const list =
    voices ??
    (typeof window !== "undefined" && "speechSynthesis" in window
      ? window.speechSynthesis.getVoices()
      : []);
  return list.filter((v) => v.lang?.toLowerCase().startsWith("ru"));
}

export function createUtterance(
  text: string,
  tuning?: BrowserTtsTuning,
): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tuning?.lang ?? "ru-RU";
  u.rate = tuning?.rate ?? 0.85;
  u.pitch = tuning?.pitch ?? 1.15;
  u.volume = tuning?.volume ?? 0.95;
  return u;
}

/** Chrome/Edge often return [] until voiceschanged; wait briefly before speak. */
export function waitForBrowserVoices(
  synth: SpeechSynthesis,
  timeoutMs = 2500,
): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, timeoutMs);
  });
}

/** Workaround for stuck speechSynthesis on Chromium. */
export function primeBrowserSpeech(synth: SpeechSynthesis): void {
  synth.resume();
  synth.cancel();
  const prime = new SpeechSynthesisUtterance(" ");
  prime.volume = 0;
  prime.rate = 10;
  synth.speak(prime);
  synth.cancel();
}
