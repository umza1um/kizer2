"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ThinkingIndicator } from "../../components/ui/ThinkingIndicator";
import { ROUTES } from "../../lib/constants/routes";
import {
  applyVoiceToUtterance,
  cleanTextForSpeech,
  createUtterance,
  splitIntoSpeakSegments,
} from "../../lib/tts/browserSpeech";
import { loadTtsSettings } from "../../lib/tts/settings";
import { prefetchTts, useHybridTts } from "../../lib/tts/useHybridTts";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Status = "ready" | "listening" | "thinking" | "speaking";

export default function QuestionsPage() {
  const [status, setStatus] = useState<Status>("ready");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastUserSpeech, setLastUserSpeech] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micPressedRef = useRef(false);
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false);
  const [hasSpeechSynthesis, setHasSpeechSynthesis] = useState(false);
  const {
    speak: speakHybrid,
    stop: stopHybrid,
    isSpeaking: isHybridSpeaking,
    unlockAudioPlayback,
  } = useHybridTts();

  /** Позиция ползунка 0–1 для каждого блока ответа (по id). */
  const [ttsPositionById, setTtsPositionById] = useState<Record<string, number>>({});
  const [playingTtsId, setPlayingTtsId] = useState<string | null>(null);
  const playingTtsIdRef = useRef<string | null>(null);

  const handleSendMessageRef = useRef<
    (text: string, source?: "text" | "voice") => Promise<void>
  >(() => Promise.resolve());

  const applyRussianVoice = useCallback((utterance: SpeechSynthesisUtterance) => {
    applyVoiceToUtterance(utterance, { mode: "preferFemaleRu" });
  }, []);

  const stopSpeaking = useCallback(() => {
    playingTtsIdRef.current = null;
    setPlayingTtsId(null);
    stopHybrid();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setStatus("ready");
  }, [stopHybrid]);

  const getTtsSpeakOptions = useCallback(() => {
    const tts = loadTtsSettings();
    return {
      provider: tts.provider,
      openAiVoice: tts.openAiVoice,
      azureVoice: tts.azureVoice,
      browserVoiceUri: tts.browserVoiceUri || undefined,
      voiceMode: "preferFemaleRu" as const,
      format: "mp3" as const,
      speed: tts.speechSpeed,
    };
  }, []);

  /**
   * Озвучка с перемоткой: играет сегменты с startIndex.
   * position01 на ползунке = доля пройденных сегментов.
   */
  const playBrowserSegmentsFrom = useCallback(
    (rawText: string, ttsId: string, startSegmentIndex: number) => {
      const runtimeOk =
        typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
      if (!runtimeOk) return;

      const cleaned = cleanTextForSpeech(rawText);
      const segments = splitIntoSpeakSegments(cleaned);
      if (segments.length === 0) return;

      const synth = window.speechSynthesis;
      playingTtsIdRef.current = null;
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

        const utterance = createUtterance(segments[i], {
          lang: "ru-RU",
          rate: 0.85,
          pitch: 1.15,
          volume: 0.95,
        });

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
    [applyRussianVoice],
  );

  const playCloudSegmentsFrom = useCallback(
    async (rawText: string, ttsId: string, startSegmentIndex: number) => {
      const cleaned = cleanTextForSpeech(rawText);
      const segments = splitIntoSpeakSegments(cleaned);
      if (segments.length === 0) return;

      const options = getTtsSpeakOptions();
      playingTtsIdRef.current = null;
      stopHybrid();
      playingTtsIdRef.current = ttsId;
      setPlayingTtsId(ttsId);

      let i = Math.max(0, Math.min(startSegmentIndex, segments.length - 1));

      const updateSlider = (segmentAfterEnd: number) => {
        const p = segmentAfterEnd / segments.length;
        setTtsPositionById((prev) => ({ ...prev, [ttsId]: Math.min(1, Math.max(0, p)) }));
      };

      updateSlider(i);
      setStatus("speaking");

      try {
        for (; i < segments.length; i += 1) {
          if (playingTtsIdRef.current !== ttsId) return;
          if (i + 1 < segments.length) {
            prefetchTts(segments[i + 1], options);
          }
          setStatus("speaking");
          await speakHybrid(segments[i], options);
          updateSlider(i + 1);
        }
      } catch (err) {
        console.error("Cloud TTS segment failed:", err);
        const msg = err instanceof Error ? err.message : "Озвучка недоступна";
        alert(msg);
      } finally {
        if (playingTtsIdRef.current === ttsId) {
          playingTtsIdRef.current = null;
          setPlayingTtsId(null);
          setStatus("ready");
          updateSlider(segments.length);
        }
      }
    },
    [getTtsSpeakOptions, speakHybrid, stopHybrid],
  );

  const playTtsFromSegment = useCallback(
    (rawText: string, ttsId: string, startSegmentIndex: number) => {
      const tts = loadTtsSettings();
      const useCloud = tts.provider === "openai" || tts.provider === "azure";
      if (useCloud) {
        void playCloudSegmentsFrom(rawText, ttsId, startSegmentIndex);
      } else {
        playBrowserSegmentsFrom(rawText, ttsId, startSegmentIndex);
      }
    },
    [playBrowserSegmentsFrom, playCloudSegmentsFrom],
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

  const handleTtsSliderChange = (ttsId: string, rawText: string, value01: number) => {
    setTtsPositionById((prev) => ({ ...prev, [ttsId]: value01 }));
    const cleaned = cleanTextForSpeech(rawText);
    const segments = splitIntoSpeakSegments(cleaned);
    if (segments.length === 0) return;
    const startIdx = position01ToStartIndex(value01, segments.length);
    playTtsFromSegment(rawText, ttsId, startIdx);
  };

  const handleSendMessage = async (text: string) => {
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

      setTtsPositionById((prev) => ({ ...prev, [ttsId]: 0 }));

      const tts = loadTtsSettings();
      const useCloudTts = tts.provider === "openai" || tts.provider === "azure";
      const canBrowserTts =
        tts.provider === "browser" &&
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        !!window.speechSynthesis;

      if (useCloudTts || canBrowserTts) {
        if (useCloudTts) {
          prefetchTts(assistantText, getTtsSpeakOptions());
        }
        playTtsFromSegment(assistantText, ttsId, 0);
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
      const SpeechRecognitionCtor =
        window.SpeechRecognition ?? window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionCtor();
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

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
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

  const startMicListening = useCallback(() => {
    if (!recognitionRef.current || !hasSpeechRecognition) return;
    if (status === "thinking") return;

    try {
      recognitionRef.current.start();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (message.includes("already started") || message.includes("started")) {
        return;
      }
      console.error("Failed to start recognition:", error);
      micPressedRef.current = false;
      setStatus("ready");
    }
  }, [hasSpeechRecognition, status]);

  const handleMicPress = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!hasSpeechRecognition || status === "thinking") return;

      unlockAudioPlayback();
      event.currentTarget.setPointerCapture(event.pointerId);
      micPressedRef.current = true;

      if (status === "speaking" || isHybridSpeaking || playingTtsIdRef.current) {
        stopSpeaking();
        window.setTimeout(() => {
          if (micPressedRef.current) startMicListening();
        }, 150);
        return;
      }

      startMicListening();
    },
    [hasSpeechRecognition, isHybridSpeaking, startMicListening, status, stopSpeaking, unlockAudioPlayback],
  );

  const handleMicRelease = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!micPressedRef.current) return;
      micPressedRef.current = false;

      if (!recognitionRef.current) return;
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    },
    [],
  );

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

  const activeTtsId = messages.length > 0 ? `m-${messages.length - 1}` : "solo";
  const canControlTts = Boolean(lastAssistantText.trim());
  const ttsSettings = loadTtsSettings();
  const canScrubTts =
    ttsSettings.provider === "openai" ||
    ttsSettings.provider === "azure" ||
    (ttsSettings.provider === "browser" && hasSpeechSynthesis);

  const micDisabled = !hasSpeechRecognition || status === "thinking";
  const micListening = status === "listening";

  return (
    <main className="relative flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
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

      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200">
        <p className="text-xs font-medium text-slate-500 mb-1">Ваш последний вопрос:</p>
        <p className="text-sm text-slate-900">
          {lastUserSpeech || "Здесь будет отображаться ваш последний вопрос."}
        </p>
      </div>

      {status === "thinking" && <ThinkingIndicator className="mb-4" />}

      <div className="mb-3 rounded-2xl bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-start justify-between mb-1">
          <p className="text-xs font-medium text-slate-300">Ответ Кизера:</p>
        </div>
        <div className="h-[32vh] min-h-[200px] max-h-[280px] overflow-y-auto pr-1">
          <p className="text-sm whitespace-pre-wrap">
            {lastAssistantText ||
              (status === "thinking"
                ? ""
                : "Здесь будет отображаться последний ответ экскурсовода.")}
          </p>
        </div>
      </div>

      {canScrubTts && (
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round((ttsPositionById[activeTtsId] ?? 0) * 100)}
          onChange={(e) =>
            handleTtsSliderChange(activeTtsId, lastAssistantText, Number(e.target.value) / 100)
          }
          disabled={!canControlTts || status === "thinking"}
          className="mb-4 w-full accent-violet-600 disabled:opacity-40"
          aria-label="Перемотка рассказа экскурсовода"
          title="Перемотка рассказа экскурсовода"
        />
      )}

      <div className="mt-auto border-t border-slate-200 pt-3 pb-[env(safe-area-inset-bottom,0px)]">
        <Link
          href={ROUTES.home}
          onClick={handleLeavePage}
          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          На главную
        </Link>
      </div>

      <button
        type="button"
        onPointerDown={handleMicPress}
        onPointerUp={handleMicRelease}
        onPointerCancel={handleMicRelease}
        disabled={micDisabled}
        className={`absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-5 z-10 flex h-16 w-16 select-none items-center justify-center rounded-full text-2xl shadow-[0_8px_24px_rgba(15,23,42,0.28)] transition active:scale-95 touch-none ${
          micListening ? "bg-blue-600" : "bg-slate-900"
        } ${micDisabled ? "cursor-not-allowed opacity-50" : ""}`}
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
        aria-label={
          micListening
            ? "Слушаю… отпустите, когда закончите вопрос"
            : "Удерживайте и говорите. Прерывает рассказ, если Кизер говорит"
        }
      >
        🎤
      </button>
    </main>
  );
}
