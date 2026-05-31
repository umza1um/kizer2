"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPlaybackError,
  pauseSharedAudio,
  playMp3Blob,
  revokeSharedObjectUrlOnEnd,
  unlockAudioPlayback,
} from "./audioPlayback";
import {
  applyVoiceToUtterance,
  cleanTextForSpeech,
  createUtterance,
  listRussianVoices,
  primeBrowserSpeech,
  waitForBrowserVoices,
  VoicePickMode,
} from "./browserSpeech";
import { shouldUseCloudTtsOnly } from "./platform";
import {
  AZURE_TTS_VOICES,
  loadTtsSettings,
  type AzureTtsVoice,
  type OpenAiTtsVoice,
  type TtsProvider,
  type TtsSettings,
} from "./settings";

export { unlockAudioPlayback };

export type { TtsProvider };

type SpeakOptions = {
  provider?: TtsProvider;
  voiceMode?: VoicePickMode;
  openAiVoice?: OpenAiTtsVoice;
  azureVoice?: AzureTtsVoice;
  browserVoiceUri?: string;
  format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  speed?: number;
};

function canUseBrowserSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
}

export function useHybridTts(defaultProvider: TtsProvider = "azure") {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const browserEndCleanupRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    if (canUseBrowserSpeech()) {
      window.speechSynthesis.cancel();
    }
    pauseSharedAudio();
    browserEndCleanupRef.current?.();
    browserEndCleanupRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speakWithBrowser = useCallback(
    async (text: string, voiceMode: VoicePickMode = "anyRu", browserVoiceUri?: string) => {
      if (!canUseBrowserSpeech()) {
        throw new Error("Браузерная озвучка недоступна");
      }

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      const synth = window.speechSynthesis;
      primeBrowserSpeech(synth);

      const voices = await waitForBrowserVoices(synth);
      if (!listRussianVoices(voices).length && !voices.length) {
        throw new Error(
          "Нет голосов для озвучки. В настройках выберите «Нейросетевые голоса».",
        );
      }

      const utterance = createUtterance(cleaned, { lang: "ru-RU", rate: 0.85, pitch: 1.15 });
      applyVoiceToUtterance(utterance, {
        mode: voiceMode,
        voices,
        voiceUri: browserVoiceUri,
      });

      await new Promise<void>((resolve, reject) => {
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };
        utterance.onerror = (ev) => {
          setIsSpeaking(false);
          const err = (ev as SpeechSynthesisErrorEvent).error;
          if (err === "interrupted" || err === "canceled") {
            resolve();
            return;
          }
          reject(new Error(`Браузерная озвучка: ${err ?? "ошибка"}`));
        };
        synth.speak(utterance);
      });
    },
    [],
  );

  const speakWithCloudApi = useCallback(async (text: string, options?: SpeakOptions) => {
    const cleaned = cleanTextForSpeech(text);
    if (!cleaned) return;

    const provider: Exclude<TtsProvider, "browser"> =
      options?.provider === "azure" ? "azure" : "openai";
    const selectedAzureVoice =
      options?.azureVoice && AZURE_TTS_VOICES.some((v) => v.id === options.azureVoice)
        ? options.azureVoice
        : "ru-RU-SvetlanaNeural";
    const selectedVoice = provider === "azure" ? selectedAzureVoice : options?.openAiVoice ?? "nova";

    const res = await fetch("/api/tts/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        text: cleaned,
        voice: selectedVoice,
        model: "gpt-4o-mini-tts",
        format: options?.format ?? "mp3",
        speed: options?.speed,
      }),
    });

    if (!res.ok) {
      let errorText = `${provider.toUpperCase()} TTS failed`;
      try {
        const payload: unknown = await res.json();
        if (
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
        ) {
          errorText = (payload as { error: string }).error;
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(errorText);
    }

    const blob = await res.blob();
    const audio = await playMp3Blob(blob);

    setIsSpeaking(true);

    await new Promise<void>((resolve) => {
      const onEnd = () => {
        cleanup();
        setIsSpeaking(false);
        resolve();
      };
      const cleanup = () => {
        audio.removeEventListener("ended", onEnd);
        audio.removeEventListener("pause", onEnd);
        revokeSharedObjectUrlOnEnd();
      };
      audio.addEventListener("ended", onEnd, { once: true });
      audio.addEventListener("pause", onEnd, { once: true });
    });
  }, []);

  const speak = useCallback(
    async (text: string, options?: SpeakOptions) => {
      const saved = loadTtsSettings();
      let provider = options?.provider ?? saved.provider ?? defaultProvider;
      if (shouldUseCloudTtsOnly() && provider === "browser") {
        provider = "azure";
      }

      const openAiVoice = options?.openAiVoice ?? saved.openAiVoice;
      const azureVoice = options?.azureVoice ?? saved.azureVoice;
      const browserVoiceUri = options?.browserVoiceUri ?? saved.browserVoiceUri;
      const voiceMode = options?.voiceMode ?? "anyRu";

      pauseSharedAudio();
      if (canUseBrowserSpeech()) {
        window.speechSynthesis.cancel();
      }

      try {
        if (provider === "openai" || provider === "azure") {
          await speakWithCloudApi(text, { ...options, provider, openAiVoice, azureVoice });
          return;
        }
        await speakWithBrowser(text, voiceMode, browserVoiceUri);
      } catch (error) {
        const allowBrowserFallback =
          !shouldUseCloudTtsOnly() &&
          (provider === "openai" || provider === "azure") &&
          canUseBrowserSpeech() &&
          !isPlaybackError(error);

        if (allowBrowserFallback) {
          console.warn(`${provider} TTS failed, fallback to browser:`, error);
          await speakWithBrowser(text, voiceMode, browserVoiceUri);
          return;
        }
        throw error;
      }
    },
    [defaultProvider, speakWithBrowser, speakWithCloudApi],
  );

  const getSettings = useCallback((): TtsSettings => loadTtsSettings(), []);

  useEffect(() => () => stop(), [stop]);

  return {
    canUseBrowserSpeech: canUseBrowserSpeech(),
    isSpeaking,
    speak,
    stop,
    getSettings,
    unlockAudioPlayback,
  };
}
