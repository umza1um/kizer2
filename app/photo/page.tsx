"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ROUTES } from "../../lib/constants/routes";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type IdentifyResult = {
  objectType: string;
  primarySubject: string;
  visualKeywords?: string[];
  confidence: "high" | "medium" | "low";
};

type ResolveResult = {
  objectName: string;
  objectType: string;
  confidence: "high" | "medium" | "low";
  why: string;
  sources: string[];
  canonicalPage?: string | null;
};

type TourResult = {
  title: string;
  tourText: string;
  quickFacts: string[];
  sources?: string[];
};

function optimizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Выбранный файл не является изображением"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (!result || typeof result !== "string") {
        reject(new Error("Не удалось прочитать файл"));
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const maxWidth = 1024;
          const quality = 0.8;
          let width = img.width;
          let height = img.height;
          if (width === 0 || height === 0) {
            reject(new Error("Некорректные размеры изображения"));
            return;
          }
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Не удалось получить контекст canvas"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          try {
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            if (!dataUrl || dataUrl === "data:,") {
              reject(new Error("Не удалось преобразовать изображение"));
              return;
            }
            resolve(dataUrl);
          } catch {
            reject(new Error("Ошибка при преобразовании в data URL"));
          }
        } catch {
          reject(new Error("Ошибка при обработке изображения"));
        }
      };
      img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      img.src = result;
    };
    reader.onerror = () => reject(new Error("Ошибка при чтении файла"));
    try {
      reader.readAsDataURL(file);
    } catch {
      reject(new Error("Не удалось начать чтение файла"));
    }
  });
}

export default function PhotoPage() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [tourResult, setTourResult] = useState<TourResult | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [status, setStatus] = useState<"ready" | "identify" | "lens" | "resolve" | "tour" | "thinking">("ready");
  const [lensDisabledReason, setLensDisabledReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const hasSpeechSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (hasSpeechSynthesis) synthesisRef.current = window.speechSynthesis;
  }, [hasSpeechSynthesis]);

  const handleImageSelect = async (file: File | null) => {
    if (!file) return;
    try {
      setImageDataUrl(null);
      setIdentifyResult(null);
      setResolveResult(null);
      setTourResult(null);
      setMessages([]);
      setUserInput("");
      setLensDisabledReason(null);
      setError(null);
      setStatus("identify");

      const optimized = await optimizeImage(file);
      setImageDataUrl(optimized);

      const identifyRes = await fetch("/api/photo/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: optimized }),
      });
      if (!identifyRes.ok) {
        const err = await identifyRes.json().catch(() => ({}));
        throw new Error(err.error || "Не удалось определить объект");
      }
      const identifyData = await identifyRes.json();
      setIdentifyResult(identifyData);
      setStatus("ready");

      let lensData: Record<string, unknown> | null = null;
      if (identifyData.confidence !== "high") {
        setStatus("lens");
        setLensDisabledReason(null);
        const lensRes = await fetch("/api/search/lens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: optimized }),
        });
        const lensJson = await lensRes.json();
        if (lensJson.disabled) {
          setLensDisabledReason(lensJson.reason || "Google Lens недоступен");
        } else if (!lensRes.ok) {
          setLensDisabledReason(lensJson.error || "Ошибка поиска");
        } else {
          lensData = lensJson;
        }
        setStatus("ready");
      }

      setStatus("resolve");
      const resolveRes = await fetch("/api/photo/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identify: identifyData, lens: lensData }),
      });
      if (!resolveRes.ok) {
        const err = await resolveRes.json().catch(() => ({}));
        throw new Error(err.error || "Не удалось проверить совпадения");
      }
      const resolveData = await resolveRes.json();
      setResolveResult(resolveData);
      setStatus("ready");

      setStatus("tour");
      const tourRes = await fetch("/api/photo/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: optimized,
          identify: identifyData,
          resolve: resolveData,
          settings: { tone: "balanced", audience: "adult" },
        }),
      });
      if (!tourRes.ok) {
        const err = await tourRes.json().catch(() => ({}));
        throw new Error(err.error || "Не удалось создать экскурсию");
      }
      const tourData = await tourRes.json();
      setTourResult(tourData);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
      setStatus("ready");
    }
  };

  const handleCaptureClick = () => captureInputRef.current?.click();
  const handleUploadClick = () => uploadInputRef.current?.click();
  const handleCaptureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
    e.target.value = "";
  };
  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
    e.target.value = "";
  };

  const speakText = (text: string) => {
    if (!hasSpeechSynthesis || !synthesisRef.current) return;
    synthesisRef.current.cancel();
    let cleaned = text;
    const idx = cleaned.indexOf("\n\nИсточники:");
    if (idx !== -1) cleaned = cleaned.substring(0, idx);
    cleaned = cleaned.replace(/\*/g, "").replace(/https?:\/\/[^\s]+/gi, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    if (!cleaned) return;
    const u = new SpeechSynthesisUtterance(cleaned);
    u.lang = "ru-RU";
    u.rate = 0.85;
    u.pitch = 1.15;
    const voices = synthesisRef.current.getVoices();
    const ru = voices.find((v) => v.lang.startsWith("ru"));
    if (ru) u.voice = ru;
    synthesisRef.current.speak(u);
  };

  const handleSendMessage = async (text: string) => {
    if (!imageDataUrl || !identifyResult || !resolveResult || !tourResult) return;
    const messageText = text.trim() || "";
    const userMessage = messageText ? { role: "user" as const, content: messageText } : null;
    const newMessages = userMessage ? [...messages, userMessage].slice(-10) : messages;
    if (userMessage) setMessages(newMessages);
    setStatus("thinking");
    setUserInput("");
    setError(null);
    try {
      const res = await fetch("/api/photo/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          identify: identifyResult,
          resolve: resolveResult,
          messages: userMessage ? newMessages : [...newMessages, { role: "user" as const, content: "Расскажи подробнее." }],
          settings: { tone: "balanced", audience: "adult" },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка ответа");
      }
      const data = await res.json();
      const assistantText = data.tourText || data.title || "Извините, не удалось получить ответ.";
      setMessages([...newMessages, { role: "assistant" as const, content: assistantText }].slice(-12));
      setStatus("ready");
      if (hasSpeechSynthesis) setTimeout(() => speakText(assistantText), 300);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setStatus("ready");
      setMessages([...newMessages, { role: "assistant" as const, content: e instanceof Error ? e.message : "Ошибка" }].slice(-12));
    }
  };

  const getConfidenceColor = (c: string) =>
    c === "high" ? "text-green-600" : c === "medium" ? "text-yellow-600" : "text-red-600";
  const getConfidenceText = (c: string) =>
    c === "high" ? "Высокая" : c === "medium" ? "Средняя" : "Низкая";

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Экскурсия по фото</h1>
        <Link href={ROUTES.home} className="text-sm text-slate-500 hover:text-slate-700">назад</Link>
      </header>

      <div className="mb-4 flex gap-2">
        <button onClick={handleCaptureClick} className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-slate-800">
          Сделать фото
        </button>
        <input ref={captureInputRef} type="file" accept="image/*" capture="environment" onChange={handleCaptureChange} className="hidden" />
        <button onClick={handleUploadClick} className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition active:scale-[0.98] hover:bg-slate-50">
          Загрузить фото
        </button>
        <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleUploadChange} className="hidden" />
      </div>

      {imageDataUrl && (
        <div className="mb-4 rounded-2xl overflow-hidden border border-slate-200">
          <img src={imageDataUrl} alt="Preview" className="w-full h-auto max-h-[200px] object-contain bg-slate-50" />
        </div>
      )}

      {(status === "identify" || status === "lens" || status === "resolve" || status === "tour") && (
        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-slate-500">
            {status === "identify" && "Определяю объект..."}
            {status === "lens" && "Ищу совпадения (Google Lens)..."}
            {status === "resolve" && "Проверяю совпадения..."}
            {status === "tour" && "Готовлю экскурсию..."}
          </p>
        </div>
      )}

      {identifyResult && (
        <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-1">
            Этот объект: <span className="font-semibold text-slate-900">{identifyResult.primarySubject}</span>
          </p>
          <span className={`text-xs font-medium ${getConfidenceColor(identifyResult.confidence)}`}>
            {getConfidenceText(identifyResult.confidence)}
          </span>
        </div>
      )}

      {lensDisabledReason && (
        <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 border border-amber-200">
          <p className="text-xs text-amber-800">
            {lensDisabledReason.includes("PUBLIC_BASE_URL") || lensDisabledReason.includes("публичный")
              ? "Для Google Lens нужен публичный URL. Укажи PUBLIC_BASE_URL (например ngrok или Vercel)."
              : lensDisabledReason}
          </p>
        </div>
      )}

      {resolveResult && (
        <div className="mb-4 rounded-2xl bg-slate-100 px-4 py-3 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-1">
            Похоже, это: <span className="font-semibold text-slate-900">{resolveResult.objectName}</span>
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">Уверенность:</span>
            <span className={`text-xs font-medium ${getConfidenceColor(resolveResult.confidence)}`}>
              {getConfidenceText(resolveResult.confidence)}
            </span>
          </div>
          {resolveResult.why && <p className="text-xs text-slate-600 mt-1">{resolveResult.why}</p>}
          {resolveResult.sources && resolveResult.sources.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-600 mb-1">Источники:</p>
              <ul className="space-y-1">
                {resolveResult.sources.slice(0, 5).map((url, i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline truncate block max-w-full">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tourResult && (
        <div className="mb-4 rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <h2 className="text-sm font-semibold mb-2">{tourResult.title}</h2>
          <p className="text-xs leading-relaxed mb-3 whitespace-pre-line">{tourResult.tourText}</p>
          {tourResult.quickFacts && tourResult.quickFacts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <p className="text-xs font-medium text-slate-300 mb-2">Интересные факты:</p>
              <ul className="space-y-1">
                {tourResult.quickFacts.map((fact, idx) => (
                  <li key={idx} className="text-xs text-slate-300">• {fact}</li>
                ))}
              </ul>
            </div>
          )}
          {tourResult.sources && tourResult.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <p className="text-xs font-medium text-slate-300 mb-2">Источники:</p>
              <ul className="space-y-1">
                {tourResult.sources.map((url, idx) => (
                  <li key={idx}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 underline break-all">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 border border-red-200">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mb-4 flex-1 overflow-y-auto space-y-3 max-h-[200px]">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`rounded-2xl px-3 py-2 ${msg.role === "user" ? "bg-slate-50 text-slate-900 ml-auto text-right" : "bg-slate-900 text-white"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs flex-1">{msg.content}</p>
                {msg.role === "assistant" && hasSpeechSynthesis && (
                  <button onClick={() => speakText(msg.content)} className="text-sm hover:opacity-70 flex-shrink-0" title="Озвучить" disabled={status === "thinking"}>
                    🔊
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {status === "thinking" && (
        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-slate-500">Думаю...</p>
        </div>
      )}

      {imageDataUrl && tourResult && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(userInput);
          }}
          className="mt-auto space-y-2"
        >
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Задайте вопрос о фото..."
            disabled={status !== "ready"}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status !== "ready"}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
          >
            Спросить Кизера
          </button>
        </form>
      )}

      {!imageDataUrl && (
        <div className="mt-auto text-center">
          <p className="text-sm text-slate-500">Сделайте или загрузите фото, чтобы начать экскурсию</p>
        </div>
      )}

      <div className="mt-4 border-t border-slate-200 pt-3 pb-[env(safe-area-inset-bottom,0px)]">
        <Link href={ROUTES.home} className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          На главную
        </Link>
      </div>
    </main>
  );
}
