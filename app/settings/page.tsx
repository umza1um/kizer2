"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AzureVoicePicker } from "../../components/tts/AzureVoicePicker";
import { ROUTES } from "../../lib/constants/routes";
import { listRussianVoices } from "../../lib/tts/browserSpeech";
import { isMobileDevice } from "../../lib/tts/platform";
import {
  loadTtsSettings,
  OPENAI_TTS_VOICES,
  saveTtsSettings,
  type TtsSettings,
} from "../../lib/tts/settings";
import { useHybridTts } from "../../lib/tts/useHybridTts";

const TEST_PHRASE =
  "Здравствуйте! Я Кизер, ваш ИИ-экскурсовод. Сейчас вы слышите тестовую фразу.";

export default function SettingsPage() {
  const [settings, setSettings] = useState<TtsSettings>(() => loadTtsSettings());
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [hasBrowserTts, setHasBrowserTts] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<string | null>(null);
  const [isPhone, setIsPhone] = useState(false);
  const { speak, stop, isSpeaking, unlockAudioPlayback } = useHybridTts();

  useEffect(() => {
    const phone = isMobileDevice();
    setIsPhone(phone);
    const current = loadTtsSettings();
    if (phone && current.provider !== "azure") {
      const fixed = { ...current, provider: "azure" as const };
      saveTtsSettings(fixed);
      setSettings(fixed);
    } else {
      setSettings(current);
    }
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
    stop();
    setTtsStatus("Загрузка голоса…");
    try {
      await speak(TEST_PHRASE, {
        provider: settings.provider === "browser" && isPhone ? "azure" : settings.provider,
        openAiVoice: settings.openAiVoice,
        azureVoice: settings.azureVoice,
        browserVoiceUri: settings.browserVoiceUri || undefined,
        voiceMode: "anyRu",
      });
      setTtsStatus(null);
    } catch (e) {
      console.error("Test TTS failed:", e);
      const msg = e instanceof Error ? e.message : "Не удалось озвучить тестовую фразу";
      setTtsStatus(msg);
      alert(msg);
    }
  };

  const showNeuralVoices = isPhone || settings.provider === "azure";

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Настройки</h1>
        <Link href={ROUTES.home} className="text-sm text-slate-500 hover:text-slate-700">
          назад
        </Link>
      </header>

      <section className="mt-6 flex flex-1 flex-col gap-5 overflow-y-auto">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Озвучка (TTS)</h2>
          <p className="mt-1 text-xs text-slate-500">
            {isPhone
              ? "На iPhone и Android используются нейросетевые голоса (как в Siri). Выберите голос ниже."
              : "Azure Neural — естественная речь. Без ключа Azure работает бесплатный Edge TTS."}
          </p>
        </div>

        {!isPhone && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">Провайдер</span>
            <select
              value={settings.provider}
              onChange={(e) =>
                updateSettings({
                  provider:
                    e.target.value === "openai"
                      ? "openai"
                      : e.target.value === "azure"
                        ? "azure"
                        : "browser",
                })
              }
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            >
              <option value="azure">Нейросетевые голоса (рекомендуется)</option>
              <option value="openai">OpenAI</option>
              <option value="browser">Браузер (робот, только ПК)</option>
            </select>
          </label>
        )}

        {showNeuralVoices && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-600">Голос Кизера</span>
            <AzureVoicePicker
              value={settings.azureVoice}
              onChange={pickAzureVoice}
              disabled={isSpeaking}
            />
          </div>
        )}

        {settings.provider === "openai" && !isPhone && (
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

        {settings.provider === "browser" && !isPhone && (
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

      <div className="mt-5 border-t border-slate-200 pt-3 pb-[env(safe-area-inset-bottom,0px)]">
        <Link
          href={ROUTES.home}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-base font-medium text-white shadow-sm transition active:scale-[0.98] hover:bg-slate-800"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
