/** Ключи localStorage для настроек озвучки на странице «Экскурсия по вопросам». */

export const STORAGE_VOICE_URI = "kizer2-questions-tts-voice-uri";
export const STORAGE_TTS_MODE = "kizer2-questions-tts-mode";
export const STORAGE_CLOUD_VOICE = "kizer2-questions-tts-cloud-voice";

export type TtsMode = "browser" | "cloud";

export const OPENAI_TTS_VOICES = [
  { id: "nova", label: "Nova (нейро, нейтральный)" },
  { id: "shimmer", label: "Shimmer (нейро)" },
  { id: "alloy", label: "Alloy" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "onyx", label: "Onyx" },
] as const;

export function loadTtsMode(): TtsMode {
  if (typeof window === "undefined") return "browser";
  const v = localStorage.getItem(STORAGE_TTS_MODE);
  return v === "cloud" ? "cloud" : "browser";
}

export function saveTtsMode(mode: TtsMode) {
  localStorage.setItem(STORAGE_TTS_MODE, mode);
}

export function loadVoiceUri(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_VOICE_URI) ?? "";
}

export function saveVoiceUri(uri: string) {
  localStorage.setItem(STORAGE_VOICE_URI, uri);
}

export function loadCloudVoice(): string {
  if (typeof window === "undefined") return "nova";
  return localStorage.getItem(STORAGE_CLOUD_VOICE) ?? "nova";
}

export function saveCloudVoice(voice: string) {
  localStorage.setItem(STORAGE_CLOUD_VOICE, voice);
}
