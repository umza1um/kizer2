"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ROUTES } from "../../lib/constants/routes";
import {
  loadCloudVoice,
  loadTtsMode,
  loadVoiceUri,
  OPENAI_TTS_VOICES,
  saveCloudVoice,
  saveTtsMode,
  saveVoiceUri,
  type TtsMode,
} from "../../lib/questions/ttsPrefs";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Status = "ready" | "listening" | "thinking" | "speaking";

/** Делит текст на фрагменты для TTS и «перемотки» (границы предложений / абзацев). */
function splitIntoSpeakSegments(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.length ? parts : [normalized];
}

function cleanTextForSpeech(text: string): string {
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

export default function QuestionsPage() {
  const [status, setStatus] = useState<Status>("ready");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [lastUserSpeech, setLastUserSpeech] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false);
  const [hasSpeechSynthesis, setHasSpeechSynthesis] = useState(false);

  const [cloudTtsEnabled, setCloudTtsEnabled] = useState(false);
  const [ttsMode, setTtsMode] = useState<TtsMode>("browser");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("");
  const [cloudVoice, setCloudVoice] = useState("nova");

  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudBlobUrlRef = useRef<string | null>(null);
  const ttsEngineRef = useRef<"browser" | "cloud" | null>(null);

  /** Позиция ползунка 0–1 для каждого блока ответа (по id). */
  const [ttsPositionById, setTtsPositionById] = useState<Record<string, number>>({});
  const [playingTtsId, setPlayingTtsId] = useState<string | null>(null);
  const playingTtsIdRef = useRef<string | null>(null);

  const handleSendMessageRef = useRef<
    (text: string, source?: "text" | "voice") => Promise<void>
  >(() => Promise.resolve());

  /** Выбранный в настройках голос браузера или авто-подбор русского. */
  const applySelectedVoice = useCallback(
    (utterance: SpeechSynthesisUtterance) => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const voices = synth.getVoices();
      if (voices.length === 0) return;
      let v: SpeechSynthesisVoice | undefined;
      if (selectedVoiceUri) {
        v = voices.find((x) => x.voiceURI === selectedVoiceUri);
      }
      if (!v) {
        v =
          voices.find(
            (x) =>
              x.lang.toLowerCase().startsWith("ru") &&
              (x.name.toLowerCase().includes("female") ||
                x.name.includes("женск") ||
                x.name.includes("Milena") ||
                x.name.includes("Katya"))
          ) || voices.find((x) => x.lang.toLowerCase().startsWith("ru"));
      }
      if (v) utterance.voice = v;
    },
    [selectedVoiceUri]
  );

  const stopSpeaking = useCallback(() => {
    playingTtsIdRef.current = null;
    setPlayingTtsId(null);
    ttsEngineRef.current = null;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    const audio = cloudAudioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
      cloudAudioRef.current = null;
    }
    if (cloudBlobUrlRef.current) {
      URL.revokeObjectURL(cloudBlobUrlRef.current);
      cloudBlobUrlRef.current = null;
    }
    setStatus("ready");
  }, []);

  /**
   * Озвучка с перемоткой: играет сегменты с startIndex.
   * position01 на ползунке = доля пройденных сегментов.
   */
  const playSegmentsFrom = useCallback(
    (rawText: string, ttsId: string, startSegmentIndex: number) => {
      const runtimeOk =
        typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
      if (!runtimeOk) return;

      const cleaned = cleanTextForSpeech(rawText);
      const segments = splitIntoSpeakSegments(cleaned);
      if (segments.length === 0) return;

      const synth = window.speechSynthesis;
      synth.cancel();

      playingTtsIdRef.current = ttsId;
      setPlayingTtsId(ttsId);
      ttsEngineRef.current = "browser";

      let i = Math.max(0, Math.min(startSegmentIndex, segments.length - 1));

      const updateSlider = (segmentAfterEnd: number) => {
        const p = segmentAfterEnd / segments.length;
        setTtsPositionById((prev) => ({ ...prev, [ttsId]: Math.min(1, Math.max(0, p)) }));
      };

      updateSlider(i);

      const speakNext = () => {
        if (playingTtsIdRef.current !== ttsId) return;
        if (i >= segments.length) {
          playingTtsIdRef.current = null;
          setPlayingTtsId(null);
          setStatus("ready");
          updateSlider(segments.length);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(segments[i]);
        utterance.lang = "ru-RU";
        utterance.rate = 0.92;
        utterance.pitch = 1;
        utterance.volume = 0.95;

        const trySpeak = () => {
          applySelectedVoice(utterance);
          utterance.onstart = () => setStatus("speaking");
          utterance.onend = () => {
            i += 1;
            updateSlider(i);
            speakNext();
          };
          utterance.onerror = () => {
            i += 1;
            updateSlider(i);
            speakNext();
          };
          try {
            synth.speak(utterance);
          } catch {
            setStatus("ready");
            playingTtsIdRef.current = null;
            setPlayingTtsId(null);
          }
        };

        if (synth.getVoices().length === 0) {
          synth.addEventListener("voiceschanged", trySpeak, { once: true });
          setTimeout(trySpeak, 100);
        } else {
          trySpeak();
        }
      };

      speakNext();
    },
    [applySelectedVoice]
  );

  /** Облачная озвучка (OpenAI): один MP3, перемотка по времени. */
  const playCloudTts = useCallback(
    async (rawText: string, ttsId: string, startPosition01: number) => {
      const cleaned = cleanTextForSpeech(rawText);
      if (!cleaned.trim()) return;

      stopSpeaking();

      playingTtsIdRef.current = ttsId;
      setPlayingTtsId(ttsId);
      ttsEngineRef.current = "cloud";

      try {
        const res = await fetch("/api/questions/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleaned, voice: cloudVoice }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(typeof err.error === "string" ? err.error : "Ошибка облачной озвучки");
          stopSpeaking();
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (cloudBlobUrlRef.current) {
          URL.revokeObjectURL(cloudBlobUrlRef.current);
        }
        cloudBlobUrlRef.current = url;

        const audio = new Audio(url);
        cloudAudioRef.current = audio;

        const onTimeUpdate = () => {
          if (playingTtsIdRef.current !== ttsId) return;
          const d = audio.duration;
          if (!d || !isFinite(d)) return;
          const p = audio.currentTime / d;
          setTtsPositionById((prev) => ({
            ...prev,
            [ttsId]: Math.min(1, Math.max(0, p)),
          }));
        };

        audio.addEventListener("timeupdate", onTimeUpdate);

        audio.addEventListener(
          "loadedmetadata",
          () => {
            const d = audio.duration;
            if (d && isFinite(d) && startPosition01 > 0) {
              audio.currentTime = startPosition01 * d;
            }
          },
          { once: true }
        );

        audio.onended = () => {
          audio.removeEventListener("timeupdate", onTimeUpdate);
          cloudAudioRef.current = null;
          if (cloudBlobUrlRef.current) {
            URL.revokeObjectURL(cloudBlobUrlRef.current);
            cloudBlobUrlRef.current = null;
          }
          playingTtsIdRef.current = null;
          setPlayingTtsId(null);
          ttsEngineRef.current = null;
          setTtsPositionById((prev) => ({ ...prev, [ttsId]: 1 }));
          setStatus("ready");
        };

        audio.onerror = () => {
          audio.removeEventListener("timeupdate", onTimeUpdate);
          stopSpeaking();
        };

        setStatus("speaking");
        await audio.play();
      } catch (e) {
        console.error(e);
        stopSpeaking();
      }
    },
    [cloudVoice, stopSpeaking]
  );

  /** Ползунок 0–1 → индекс сегмента с которого начать. */
  const position01ToStartIndex = (position01: number, segmentCount: number) => {
    if (segmentCount <= 0) return 0;
    if (position01 >= 1) return Math.max(0, segmentCount - 1);
    return Math.min(
      segmentCount - 1,
      Math.floor(position01 * segmentCount)
    );
  };

  const handleTtsPlay = (rawText: string, ttsId: string) => {
    const pos = ttsPositionById[ttsId] ?? 0;
    if (ttsMode === "cloud" && cloudTtsEnabled) {
      void playCloudTts(rawText, ttsId, pos);
      return;
    }
    if (!hasSpeechSynthesis) return;
    const cleaned = cleanTextForSpeech(rawText);
    const segments = splitIntoSpeakSegments(cleaned);
    if (segments.length === 0) return;
    const startIdx = position01ToStartIndex(pos, segments.length);
    playSegmentsFrom(rawText, ttsId, startIdx);
  };

  const handleTtsStop = () => {
    stopSpeaking();
  };

  const handleTtsSliderChange = (ttsId: string, rawText: string, value01: number) => {
    setTtsPositionById((prev) => ({ ...prev, [ttsId]: value01 }));
    if (playingTtsIdRef.current !== ttsId) return;

    if (ttsEngineRef.current === "cloud" && cloudAudioRef.current) {
      const audio = cloudAudioRef.current;
      const d = audio.duration;
      if (d && isFinite(d)) {
        audio.currentTime = value01 * d;
      }
      return;
    }

    const cleaned = cleanTextForSpeech(rawText);
    const segments = splitIntoSpeakSegments(cleaned);
    if (segments.length === 0) return;
    const startIdx = position01ToStartIndex(value01, segments.length);
    playSegmentsFrom(rawText, ttsId, startIdx);
  };

  const handleSendMessage = async (text: string, source: "text" | "voice" = "text") => {
    if (!text.trim()) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage].slice(-10);
    setMessages(newMessages);
    setStatus("thinking");
    setUserInput("");

    try {
      const response = await fetch("/api/questions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          messages: newMessages.slice(0, -1),
          settings: {
            tone: "balanced",
            audience: "adult",
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Ошибка ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const assistantText = data.assistantText || "Извините, не удалось получить ответ.";

      const assistantMessage: Message = { role: "assistant", content: assistantText };
      const updated = [...newMessages, assistantMessage].slice(-12);
      setMessages(updated);
      setLastAssistantText(assistantText);
      setStatus("ready");

      const assistantIdx = updated.length - 1;
      const ttsId = `m-${assistantIdx}`;

      const browserTts =
        typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
      const useCloud = ttsMode === "cloud" && cloudTtsEnabled;

      if (useCloud) {
        setTtsPositionById((prev) => ({ ...prev, [ttsId]: 0 }));
        setTimeout(() => {
          void playCloudTts(assistantText, ttsId, 0);
        }, 300);
      } else if (browserTts) {
        setTtsPositionById((prev) => ({ ...prev, [ttsId]: 0 }));
        setTimeout(() => {
          playSegmentsFrom(assistantText, ttsId, 0);
        }, 300);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setStatus("ready");
      const errorText = error instanceof Error ? error.message : "Произошла ошибка. Попробуйте ещё раз.";
      const errorMessage: Message = {
        role: "assistant",
        content: errorText,
      };
      setMessages([...newMessages, errorMessage].slice(-12));
    }
  };

  handleSendMessageRef.current = handleSendMessage;

  useEffect(() => {
    setSelectedVoiceUri(loadVoiceUri());
    setTtsMode(loadTtsMode());
    setCloudVoice(loadCloudVoice());
  }, []);

  useEffect(() => {
    fetch("/api/questions/tts")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setCloudTtsEnabled(Boolean(d.enabled)))
      .catch(() => setCloudTtsEnabled(false));
  }, []);

  useEffect(() => {
    if (!cloudTtsEnabled && ttsMode === "cloud") {
      setTtsMode("browser");
      saveTtsMode("browser");
    }
  }, [cloudTtsEnabled, ttsMode]);

  const refreshVoices = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const all = window.speechSynthesis.getVoices();
    const ru = all.filter((v) => v.lang.toLowerCase().startsWith("ru"));
    setAvailableVoices(ru.length > 0 ? ru : all);
  }, []);

  useEffect(() => {
    refreshVoices();
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.addEventListener("voiceschanged", refreshVoices);
    return () => synth.removeEventListener("voiceschanged", refreshVoices);
  }, [refreshVoices]);

  useEffect(() => {
    const speechRecognitionAvailable =
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    const speechSynthesisAvailable =
      typeof window !== "undefined" && "speechSynthesis" in window;

    setHasSpeechRecognition(speechRecognitionAvailable);
    setHasSpeechSynthesis(speechSynthesisAvailable);

    if (speechRecognitionAvailable) {
      const SpeechRecognition =
        window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "ru-RU";

      recognitionRef.current.onstart = () => {
        setStatus("listening");
      };

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setLastUserSpeech(transcript);
        void handleSendMessageRef.current(transcript, "voice");
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setStatus("ready");
        if (event.error === "not-allowed") {
          alert("Разрешите доступ к микрофону в настройках браузера");
        }
      };

      recognitionRef.current.onend = () => {
        setStatus((s) => (s === "listening" ? "ready" : s));
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (cloudBlobUrlRef.current) {
        URL.revokeObjectURL(cloudBlobUrlRef.current);
        cloudBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleStartListening = () => {
    const currentStatus = status;

    if (currentStatus === "speaking") {
      stopSpeaking();
    }

    if (currentStatus === "listening" && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      return;
    }

    const delay = currentStatus === "speaking" ? 200 : 0;

    setTimeout(() => {
      if (!recognitionRef.current) return;

      try {
        recognitionRef.current.start();
      } catch (error: any) {
        if (error?.message?.includes("already started") || error?.message?.includes("started")) {
          return;
        }
        console.error("Failed to start recognition:", error);
        setStatus("ready");
      }
    }, delay);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSendMessage(userInput, "text");
  };

  const getStatusText = () => {
    switch (status) {
      case "ready":
        return "Готов к общению";
      case "listening":
        return "Слушаю...";
      case "thinking":
        return "Думаю...";
      case "speaking":
        return "Отвечаю...";
      default:
        return "Готов к общению";
    }
  };

  /** Текущий ответ для озвучки: последний ответ ассистента в чате или solo-блок. */
  const activeTtsTarget = useMemo(() => {
    if (messages.length > 0) {
      for (let idx = messages.length - 1; idx >= 0; idx--) {
        if (messages[idx].role === "assistant") {
          return { id: `m-${idx}`, text: messages[idx].content };
        }
      }
    }
    if (lastAssistantText && messages.length === 0) {
      return { id: "solo", text: lastAssistantText };
    }
    return null;
  }, [messages, lastAssistantText]);

  /**
   * История без дублирования последнего ответа ассистента — он показан в крупном блоке «Ответ Кизера».
   */
  const displayMessages = useMemo(() => {
    if (messages.length === 0) return [];
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      return messages.slice(0, -1);
    }
    return messages;
  }, [messages]);

  const messagesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [displayMessages]);

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Экскурсия по вопросам</h1>
        <Link
          href={ROUTES.home}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          назад
        </Link>
      </header>

      <div className="mb-4 text-center">
        <p className="text-xs font-medium text-slate-500">{getStatusText()}</p>
      </div>

      {hasSpeechRecognition && (
        <div className="mb-6 flex justify-center">
          <button
            onClick={handleStartListening}
            disabled={status === "thinking"}
            className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl shadow-lg transition active:scale-95 hover:bg-slate-800 ${
              status === "speaking"
                ? "bg-red-600 hover:bg-red-700"
                : status === "listening"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-slate-900"
            } ${status === "thinking" ? "opacity-50 cursor-not-allowed" : ""}`}
            title={
              status === "speaking"
                ? "Прервать и начать слушать"
                : status === "listening"
                  ? "Остановить прослушивание"
                  : "Начать говорить"
            }
          >
            🎤
          </button>
        </div>
      )}

      {lastUserSpeech && (
        <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-1">Вы сказали:</p>
          <p className="text-sm text-slate-900">{lastUserSpeech}</p>
        </div>
      )}

      {activeTtsTarget && (
        <div className="mb-4 rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-start justify-between mb-1">
            <p className="text-xs font-medium text-slate-300">Ответ Кизера:</p>
          </div>
          <p className="text-sm whitespace-pre-wrap">{activeTtsTarget.text}</p>
        </div>
      )}

      {displayMessages.length > 0 && (
        <div
          ref={messagesScrollRef}
          className="mb-4 flex-1 overflow-y-auto space-y-3 max-h-[200px]"
        >
          {displayMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`rounded-2xl px-3 py-2 ${
                msg.role === "user"
                  ? "bg-slate-50 text-slate-900 ml-auto text-right"
                  : "bg-slate-900 text-white"
              }`}
            >
              <p className="text-xs flex-1 whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
        </div>
      )}

      {activeTtsTarget && (hasSpeechSynthesis || cloudTtsEnabled) && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-600 mb-2">Озвучка экскурсии</p>

            {cloudTtsEnabled && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Источник звука
                </label>
                <select
                  value={ttsMode}
                  onChange={(e) => {
                    const m = e.target.value as TtsMode;
                    stopSpeaking();
                    setTtsMode(m);
                    saveTtsMode(m);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value="browser">Голос браузера (бесплатно)</option>
                  <option value="cloud">Облако OpenAI (нейро)</option>
                </select>
              </div>
            )}

            {!cloudTtsEnabled && (
              <p className="mb-3 text-[10px] text-amber-700">
                Облачная нейро-озвучка: задайте OPENAI_API_KEY на сервере. Сейчас доступен голос
                браузера.
              </p>
            )}

            {ttsMode === "browser" && hasSpeechSynthesis && availableVoices.length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Голос устройства
                </label>
                <select
                  value={selectedVoiceUri}
                  onChange={(e) => {
                    const uri = e.target.value;
                    setSelectedVoiceUri(uri);
                    saveVoiceUri(uri);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value="">Авто (русский)</option>
                  {availableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {ttsMode === "cloud" && cloudTtsEnabled && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Голос OpenAI (tts-1-hd)
                </label>
                <select
                  value={cloudVoice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCloudVoice(v);
                    saveCloudVoice(v);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  {OPENAI_TTS_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTtsPlay(activeTtsTarget.text, activeTtsTarget.id)}
                disabled={status === "thinking"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                title="Слушать с выбранного места"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={handleTtsStop}
                disabled={playingTtsId !== activeTtsTarget.id}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-40"
                title="Стоп"
              >
                ⏹
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((ttsPositionById[activeTtsTarget.id] ?? 0) * 100)}
                onChange={(e) =>
                  handleTtsSliderChange(
                    activeTtsTarget.id,
                    activeTtsTarget.text,
                    Number(e.target.value) / 100
                  )
                }
                disabled={status === "thinking"}
                className="min-w-0 flex-1 accent-slate-900"
                title={
                  ttsMode === "cloud" && cloudTtsEnabled
                    ? "Перемотка по времени"
                    : "Перемотка по частям текста"
                }
              />
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              {ttsMode === "cloud" && cloudTtsEnabled
                ? "Перемотка по времени записи; во время воспроизведения можно перетащить ползунок."
                : "Перемотка по предложениям; во время чтения можно перетащить ползунок."}
            </p>
          </div>
        )}

      <form onSubmit={handleTextSubmit} className="mt-auto space-y-2">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Введите вопрос..."
          disabled={status !== "ready"}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!userInput.trim() || status !== "ready"}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
        >
          Отправить
        </button>
      </form>

      <div className="mt-4 border-t border-slate-200 pt-3 pb-[env(safe-area-inset-bottom,0px)]">
        <Link
          href={ROUTES.home}
          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
