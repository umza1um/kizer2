"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ROUTES } from "../../lib/constants/routes";

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
  const [lastUserSpeech, setLastUserSpeech] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false);
  const [hasSpeechSynthesis, setHasSpeechSynthesis] = useState(false);

  /** Позиция ползунка 0–1 для каждого блока ответа (по id). */
  const [ttsPositionById, setTtsPositionById] = useState<Record<string, number>>({});
  const [playingTtsId, setPlayingTtsId] = useState<string | null>(null);
  const playingTtsIdRef = useRef<string | null>(null);

  const handleSendMessageRef = useRef<
    (text: string, source?: "text" | "voice") => Promise<void>
  >(() => Promise.resolve());

  const applyRussianVoice = useCallback((utterance: SpeechSynthesisUtterance) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const voices = synth.getVoices();
    if (voices.length === 0) return;
    const russianVoice =
      voices.find(
        (v) => v.lang.startsWith("ru") && (v.name.includes("женск") || v.name.includes("Female"))
      ) || voices.find((v) => v.lang.startsWith("ru"));
    if (russianVoice) utterance.voice = russianVoice;
  }, []);

  const stopSpeaking = useCallback(() => {
    playingTtsIdRef.current = null;
    setPlayingTtsId(null);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
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
        utterance.rate = 0.85;
        utterance.pitch = 1.15;
        utterance.volume = 0.95;

        const trySpeak = () => {
          applyRussianVoice(utterance);
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
    [applyRussianVoice]
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
    const cleaned = cleanTextForSpeech(rawText);
    const segments = splitIntoSpeakSegments(cleaned);
    if (segments.length === 0) return;
    const pos = ttsPositionById[ttsId] ?? 0;
    const startIdx = position01ToStartIndex(pos, segments.length);
    playSegmentsFrom(rawText, ttsId, startIdx);
  };

  const handleTtsStop = () => {
    stopSpeaking();
  };

  const handleTtsSliderChange = (ttsId: string, rawText: string, value01: number) => {
    setTtsPositionById((prev) => ({ ...prev, [ttsId]: value01 }));
    if (playingTtsIdRef.current === ttsId) {
      const cleaned = cleanTextForSpeech(rawText);
      const segments = splitIntoSpeakSegments(cleaned);
      if (segments.length === 0) return;
      const startIdx = position01ToStartIndex(value01, segments.length);
      playSegmentsFrom(rawText, ttsId, startIdx);
    }
  };

  const handleSendMessage = async (text: string, source: "text" | "voice" = "text") => {
    if (!text.trim()) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage].slice(-10);
    setMessages(newMessages);
    setStatus("thinking");
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

      const canTts =
        typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
      if (canTts) {
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

  const handleLeavePage = useCallback(() => {
    stopSpeaking();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop errors during navigation
      }
    }
  }, [stopSpeaking]);

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Экскурсия по вопросам</h1>
        <Link
          href={ROUTES.home}
          onClick={handleLeavePage}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          назад
        </Link>
      </header>

      <div className="mb-6 flex justify-center">
        <button
          onClick={handleStartListening}
          disabled={!hasSpeechRecognition || status === "thinking"}
          className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl shadow-lg transition active:scale-95 hover:bg-slate-800 ${
            status === "speaking"
              ? "bg-red-600 hover:bg-red-700"
              : status === "listening"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-slate-900"
          } ${!hasSpeechRecognition || status === "thinking" ? "opacity-50 cursor-not-allowed" : ""}`}
          title={
            !hasSpeechRecognition
              ? "Голосовой ввод недоступен"
              : status === "speaking"
                ? "Прервать и начать слушать"
                : status === "listening"
                  ? "Остановить прослушивание"
                  : "Начать говорить"
          }
        >
          🎤
        </button>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200">
        <p className="text-xs font-medium text-slate-500 mb-1">Ваш последний вопрос:</p>
        <p className="text-sm text-slate-900">
          {lastUserSpeech || "Здесь будет отображаться ваш последний вопрос."}
        </p>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-start justify-between mb-1">
          <p className="text-xs font-medium text-slate-300">Ответ Кизера:</p>
        </div>
        <div className="h-[32vh] min-h-[200px] max-h-[280px] overflow-y-auto pr-1">
          <p className="text-sm whitespace-pre-wrap">
            {lastAssistantText || "Здесь будет отображаться последний ответ экскурсовода."}
          </p>
        </div>
      </div>

      <div className="mt-auto border-t border-slate-200 pt-3 pb-[env(safe-area-inset-bottom,0px)]">
        <Link
          href={ROUTES.home}
          onClick={handleLeavePage}
          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
