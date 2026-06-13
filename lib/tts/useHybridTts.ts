"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPlaybackError,
  pauseSharedAudio,
  playMp3BlobAndWait,
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
import { chunkTextForTts, shouldUseChunkedTts } from "./chunkText";
import { fetchCloudTtsBlob, prefetchCloudTts } from "./cloudTtsClient";
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

export function prefetchTts(text: string, options?: SpeakOptions): void {
  const saved = loadTtsSettings();
  let provider = options?.provider ?? saved.provider;
  if (shouldUseCloudTtsOnly() && provider === "browser") provider = "azure";
  if (provider !== "azure" && provider !== "openai") return;

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return;

  const cloudProvider = provider === "azure" ? "azure" : "openai";
  const azureVoice = options?.azureVoice ?? saved.azureVoice;
  const openAiVoice = options?.openAiVoice ?? saved.openAiVoice;
  const voice =
    cloudProvider === "azure"
      ? AZURE_TTS_VOICES.some((v) => v.id === azureVoice)
        ? azureVoice
        : "ru-RU-SvetlanaNeural"
      : openAiVoice;
  const speed = options?.speed ?? saved.speechSpeed ?? 1.15;

  const chunks = shouldUseChunkedTts(cleaned) ? chunkTextForTts(cleaned) : [cleaned];
  if (chunks[0]) prefetchCloudTts({ provider: cloudProvider, voice, text: chunks[0], speed });
  if (chunks[1]) prefetchCloudTts({ provider: cloudProvider, voice, text: chunks[1], speed });
}

export function useHybridTts(defaultProvider: TtsProvider = "azure") {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const speakGenRef = useRef(0);

  const cancelOngoing = useCallback(() => {
    speakGenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (canUseBrowserSpeech()) {
      window.speechSynthesis.cancel();
    }
    pauseSharedAudio();
    setIsSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    cancelOngoing();
  }, [cancelOngoing]);

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

      const saved = loadTtsSettings();
      const rate = Math.min(1.4, (saved.speechSpeed ?? 1.15) * 0.9);

      const utterance = createUtterance(cleaned, { lang: "ru-RU", rate, pitch: 1.12 });
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

  const speakWithCloudApi = useCallback(
    async (text: string, options?: SpeakOptions, generation?: number) => {
      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      const saved = loadTtsSettings();
      const provider: Exclude<TtsProvider, "browser"> =
        options?.provider === "azure" ? "azure" : "openai";
      const azureVoice = options?.azureVoice ?? saved.azureVoice;
      const openAiVoice = options?.openAiVoice ?? saved.openAiVoice;
      const selectedAzureVoice =
        AZURE_TTS_VOICES.some((v) => v.id === azureVoice) ? azureVoice : "ru-RU-SvetlanaNeural";
      const selectedVoice = provider === "azure" ? selectedAzureVoice : openAiVoice ?? "nova";
      const speed = options?.speed ?? saved.speechSpeed ?? 1.15;

      const chunks = shouldUseChunkedTts(cleaned) ? chunkTextForTts(cleaned) : [cleaned];
      const abort = new AbortController();
      abortRef.current = abort;

      setIsSpeaking(true);

      try {
        for (let i = 0; i < chunks.length; i++) {
          if (generation !== undefined && generation !== speakGenRef.current) return;
          if (abort.signal.aborted) return;

          const chunk = chunks[i];
          const nextChunk = chunks[i + 1];

          if (nextChunk) {
            prefetchCloudTts({
              provider,
              voice: selectedVoice,
              text: nextChunk,
              speed,
            });
          }

          const blob = await fetchCloudTtsBlob({
            provider,
            voice: selectedVoice,
            text: chunk,
            speed,
            signal: abort.signal,
          });

          if (generation !== undefined && generation !== speakGenRef.current) return;
          if (abort.signal.aborted) return;

          await playMp3BlobAndWait(blob);
        }
      } finally {
        if (abortRef.current === abort) abortRef.current = null;
        if (generation === undefined || generation === speakGenRef.current) {
          setIsSpeaking(false);
        }
      }
    },
    [],
  );

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
      const speed = options?.speed ?? saved.speechSpeed ?? 1.15;

      const generation = ++speakGenRef.current;
      abortRef.current?.abort();
      abortRef.current = null;
      pauseSharedAudio();
      if (canUseBrowserSpeech()) {
        window.speechSynthesis.cancel();
      }

      try {
        if (provider === "openai" || provider === "azure") {
          await speakWithCloudApi(text, { ...options, provider, openAiVoice, azureVoice, speed }, generation);
          return;
        }
        await speakWithBrowser(text, voiceMode, browserVoiceUri);
      } catch (error) {
        if (generation !== speakGenRef.current) return;

        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof Error && error.name === "AbortError") return;

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

  useEffect(() => () => cancelOngoing(), [cancelOngoing]);

  return {
    canUseBrowserSpeech: canUseBrowserSpeech(),
    isSpeaking,
    speak,
    stop,
    getSettings,
    unlockAudioPlayback,
    prefetchTts,
  };
}
