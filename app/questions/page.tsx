"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ROUTES } from "../../lib/constants/routes";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Status = "ready" | "listening" | "thinking" | "speaking";

export default function QuestionsPage() {
  const [status, setStatus] = useState<Status>("ready");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [lastUserSpeech, setLastUserSpeech] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const hasSpeechRecognition = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const hasSpeechSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (hasSpeechRecognition) {
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
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
        handleSendMessage(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setStatus("ready");
        if (event.error === "not-allowed") {
          alert("Разрешите доступ к микрофону в настройках браузера");
        }
      };

      recognitionRef.current.onend = () => {
        if (status === "listening") {
          setStatus("ready");
        }
      };
    }

    if (hasSpeechSynthesis) {
      synthesisRef.current = window.speechSynthesis;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, [hasSpeechRecognition, hasSpeechSynthesis, status]);

  const speakText = (text: string) => {
    if (!hasSpeechSynthesis || !synthesisRef.current) return;

    synthesisRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setStatus("speaking");
    };

    utterance.onend = () => {
      setStatus("ready");
    };

    utterance.onerror = () => {
      setStatus("ready");
    };

    synthesisRef.current.speak(utterance);
  };

  const handleStartListening = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error("Failed to start recognition:", error);
      setStatus("ready");
    }
  };

  const handleSendMessage = async (text: string) => {
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
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      const assistantText = data.assistantText || "Извините, не удалось получить ответ.";

      const assistantMessage: Message = { role: "assistant", content: assistantText };
      setMessages([...newMessages, assistantMessage].slice(-12));
      setLastAssistantText(assistantText);

      if (hasSpeechSynthesis) {
        speakText(assistantText);
      } else {
        setStatus("ready");
      }
    } catch (error) {
      console.error("Chat error:", error);
      setStatus("ready");
      const errorMessage: Message = {
        role: "assistant",
        content: "Произошла ошибка. Попробуйте ещё раз.",
      };
      setMessages([...newMessages, errorMessage].slice(-12));
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(userInput);
  };

  const handleRepeat = () => {
    if (lastAssistantText) {
      speakText(lastAssistantText);
    }
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

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">
          Экскурсия по вопросам
        </h1>
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
            disabled={status !== "ready"}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 text-3xl shadow-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
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

      {lastAssistantText && (
        <div className="mb-4 rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-start justify-between mb-1">
            <p className="text-xs font-medium text-slate-300">Ответ Кизера:</p>
            {hasSpeechSynthesis && (
              <button
                onClick={handleRepeat}
                className="text-lg hover:opacity-70 transition"
                title="Повторить"
              >
                🔊
              </button>
            )}
          </div>
          <p className="text-sm">{lastAssistantText}</p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mb-4 flex-1 overflow-y-auto space-y-3 max-h-[200px]">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`rounded-2xl px-3 py-2 ${
                msg.role === "user"
                  ? "bg-slate-50 text-slate-900 ml-auto text-right"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <p className="text-xs">{msg.content}</p>
            </div>
          ))}
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
