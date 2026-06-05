"use client";

import { useCallback, useEffect, useState } from "react";
import { AzureVoicePicker } from "./AzureVoicePicker";
import { listRussianVoices } from "../../lib/tts/browserSpeech";
import { isMobileDevice } from "../../lib/tts/platform";
import {
  loadTtsSettings,
  OPENAI_TTS_VOICES,
  saveTtsSettings,
  TTS_SPEED_OPTIONS,
  type TtsSettings,
  type TtsSpeechSpeed,
} from "../../lib/tts/settings";
import { unlockAudioPlayback, useHybridTts } from "../../lib/tts/useHybridTts";

const TEST_PHRASE =
  "Здравствуйте! Я Кизер, ваш ИИ-экскурсовод. Сейчас вы слышите тестовую фразу.";

const PROVIDER_OPTIONS: { value: TtsSettings["provider"]; label: string; hint?: string }[] = [
  { value: "azure", label: "Нейросетевые голоса (рекомендуется)" },
  { value: "openai", label: "OpenAI" },
  { value: "browser", label: "Браузер (робот)", hint: "только ПК" },
];

export function TtsSettingsPanel() {
  const [settings, setSettings] = useState<TtsSettings>(() => loadTtsSettings());
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [hasBrowserTts, setHasBrowserTts] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<string | null>(null);
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && isMobileDevice(),
  );
  const { speak, stop, isSpeaking } = useHybridTts();

  useEffect(() => {
    setMobile(isMobileDevice());
    setSettings(loadTtsSettings());
  }, []);

  const refreshBrowserVoices = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setHasBrowserTts(false);
      setBrowserVoices([]);
      return;
    }
    setHasBrowserTts(true);
    setBrowserVoices(listRussianVoices(window.speechSynthesis.getVoices()));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const onVoicesChanged = () => refreshBrowserVoices();
    synth.addEventListener("voiceschanged", onVoicesChanged);
    window.setTimeout(onVoicesChanged, 0);
    return () => synth.removeEventListener("voiceschanged", onVoicesChanged);
  }, [refreshBrowserVoices]);

  const updateSettings = (patch: Partial<TtsSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveTtsSettings(next);
      return next;
    });
  };

  const pickAzureVoice = (azureVoice: TtsSettings["azureVoice"]) => {
    updateSettings({ provider: "azure", azureVoice });
  };

  const handleTestSpeak = async () => {
    unlockAudioPlayback();
    setTtsStatus("Загрузка голоса…");
    try {
      await speak(TEST_PHRASE, {
        provider: settings.provider,
        openAiVoice: settings.openAiVoice,
        azureVoice: settings.azureVoice,
        browserVoiceUri: settings.browserVoiceUri || undefined,
        voiceMode: "anyRu",
        speed: settings.speechSpeed,
      });
      setTtsStatus(null);
    } catch (e) {
      console.error("Test TTS failed:", e);
      const msg = e instanceof Error ? e.message : "Не удалось озвучить тестовую фразу";
      setTtsStatus(msg);
      alert(msg);
    }
  };

  const showNeuralVoices = settings.provider === "azure";
  const showOpenAiVoices = settings.provider === "openai";
  const showBrowserVoices = settings.provider === "browser" && !mobile;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Озвучка (TTS)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Нейросетевые голоса — естественная речь. Без ключа Azure используется бесплатный Edge TTS.
          {mobile ? " На телефоне доступны только нейросетевые и OpenAI-голоса." : ""}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-600">Провайдер</span>
        <select
          value={settings.provider}
          onChange={(e) => {
            const value = e.target.value;
            updateSettings({
              provider:
                value === "openai" ? "openai" : value === "browser" ? "browser" : "azure",
            });
          }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.value === "browser" && mobile}
            >
              {opt.label}
              {opt.hint ? ` (${opt.hint})` : ""}
            </option>
          ))}
        </select>
      </label>

      {showNeuralVoices && (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-600">Голос Кизера</span>
            <AzureVoicePicker
              value={settings.azureVoice}
              onChange={pickAzureVoice}
              disabled={isSpeaking}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-600">Скорость речи</span>
            <div className="flex gap-2">
              {TTS_SPEED_OPTIONS.map((opt) => {
                const selected = settings.speechSpeed === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isSpeaking}
                    onClick={() => updateSettings({ speechSpeed: opt.value as TtsSpeechSpeed })}
                    className={[
                      "flex-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition active:scale-[0.98]",
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-800",
                      isSpeaking ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Длинные ответы озвучиваются по фразам — звук начинается быстрее.
            </p>
          </div>
        </>
      )}

      {showOpenAiVoices && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600">Голос OpenAI</span>
          <select
            value={settings.openAiVoice}
            onChange={(e) =>
              updateSettings({
                openAiVoice: e.target.value as TtsSettings["openAiVoice"],
              })
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          >
            {OPENAI_TTS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {showBrowserVoices && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600">Голос браузера (русский)</span>
          <select
            value={settings.browserVoiceUri}
            onChange={(e) => updateSettings({ browserVoiceUri: e.target.value })}
            disabled={!hasBrowserTts}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50"
          >
            <option value="">Авто (лучший русский)</option>
            {browserVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          {!hasBrowserTts && (
            <p className="text-xs text-amber-700">Браузерная озвучка недоступна в этой среде.</p>
          )}
        </label>
      )}

      {settings.provider === "browser" && mobile && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          На телефоне браузерная озвучка недоступна. Выберите «Нейросетевые голоса».
        </p>
      )}

      {ttsStatus && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {ttsStatus}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            unlockAudioPlayback();
            void handleTestSpeak();
          }}
          disabled={isSpeaking && !ttsStatus?.startsWith("Загрузка")}
          className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {isSpeaking
            ? "Играет…"
            : ttsStatus?.startsWith("Загрузка")
              ? "Загрузка…"
              : "Прослушать пример"}
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!isSpeaking}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Стоп
        </button>
      </div>
    </section>
  );
}
