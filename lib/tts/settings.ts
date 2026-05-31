import { isMobileDevice } from "./platform";

export const TTS_SETTINGS_STORAGE_KEY = "kizer-tts-settings";

export type TtsProvider = "browser" | "openai" | "azure";

export type OpenAiTtsVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "fable"
  | "nova"
  | "onyx"
  | "sage"
  | "shimmer";

export type TtsSettings = {
  provider: TtsProvider;
  openAiVoice: OpenAiTtsVoice;
  azureVoice: AzureTtsVoice;
  /** Пустая строка — автоматический выбор русского голоса в браузере. */
  browserVoiceUri: string;
};

export type AzureTtsVoice =
  | "ru-RU-SvetlanaNeural"
  | "ru-RU-DmitryNeural"
  | "ru-RU-DariyaNeural";

export const OPENAI_TTS_VOICES: { id: OpenAiTtsVoice; label: string }[] = [
  { id: "nova", label: "Nova (мягкий, нейтральный)" },
  { id: "shimmer", label: "Shimmer (теплый)" },
  { id: "alloy", label: "Alloy" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "onyx", label: "Onyx (низкий)" },
  { id: "coral", label: "Coral" },
  { id: "sage", label: "Sage" },
  { id: "ash", label: "Ash" },
  { id: "ballad", label: "Ballad" },
];

const DEFAULT_SETTINGS: TtsSettings = {
  provider: "azure",
  openAiVoice: "nova",
  azureVoice: "ru-RU-SvetlanaNeural",
  browserVoiceUri: "",
};

function envDefaultProvider(): TtsProvider | null {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TTS_PROVIDER === "openai") {
    return "openai";
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TTS_PROVIDER === "azure") {
    return "azure";
  }
  return null;
}

export const AZURE_TTS_VOICES: { id: AzureTtsVoice; label: string }[] = [
  { id: "ru-RU-SvetlanaNeural", label: "Svetlana Neural (женский)" },
  { id: "ru-RU-DmitryNeural", label: "Dmitry Neural (мужской)" },
  { id: "ru-RU-DariyaNeural", label: "Dariya Neural (женский)" },
];

export function getDefaultTtsSettings(): TtsSettings {
  const envProvider = envDefaultProvider();
  const base = {
    ...DEFAULT_SETTINGS,
    ...(envProvider ? { provider: envProvider } : {}),
  };
  if (typeof window !== "undefined" && isMobileDevice() && base.provider === "browser") {
    return { ...base, provider: "azure" };
  }
  return base;
}

/** На телефонах браузерный TTS роботизированный — переводим на Azure Neural. */
export function normalizeTtsSettingsForDevice(settings: TtsSettings): TtsSettings {
  if (!isMobileDevice()) return settings;
  if (settings.provider !== "browser") return settings;
  return { ...settings, provider: "azure" };
}

export function loadTtsSettings(): TtsSettings {
  if (typeof window === "undefined") {
    return getDefaultTtsSettings();
  }

  try {
    const raw = window.localStorage.getItem(TTS_SETTINGS_STORAGE_KEY);
    if (!raw) return getDefaultTtsSettings();

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return getDefaultTtsSettings();
    }

    const p = parsed as Partial<TtsSettings>;
    const defaults = getDefaultTtsSettings();

    const loaded: TtsSettings = {
      provider:
        p.provider === "openai" || p.provider === "browser" || p.provider === "azure"
          ? p.provider
          : defaults.provider,
      openAiVoice:
        OPENAI_TTS_VOICES.some((v) => v.id === p.openAiVoice) && p.openAiVoice
          ? p.openAiVoice
          : defaults.openAiVoice,
      azureVoice:
        AZURE_TTS_VOICES.some((v) => v.id === p.azureVoice) && p.azureVoice
          ? p.azureVoice
          : defaults.azureVoice,
      browserVoiceUri: typeof p.browserVoiceUri === "string" ? p.browserVoiceUri : "",
    };

    const normalized = normalizeTtsSettingsForDevice(loaded);
    if (normalized.provider !== loaded.provider) {
      saveTtsSettings(normalized);
    }
    return normalized;
  } catch {
    return getDefaultTtsSettings();
  }
}

export function saveTtsSettings(settings: TtsSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TTS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("kizer-tts-settings-changed", { detail: settings }));
}
