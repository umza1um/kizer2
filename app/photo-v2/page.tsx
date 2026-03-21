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
  visualKeywords: string[];
  stylePeriodHint: string | null;
  textOnObject: string | null;
  locationClues: string | null;
  confidence: "high" | "medium" | "low";
};

type ResolveResult = {
  objectName: string;
  objectType: string;
  locationHint: string | null;
  confidence: "high" | "medium" | "low";
  why: string;
  sources: string[];
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
          } catch (toDataUrlError) {
            reject(new Error("Ошибка при преобразовании в data URL"));
          }
        } catch (canvasError) {
          reject(new Error("Ошибка при обработке изображения на canvas"));
        }
      };

      img.onerror = () => {
        reject(new Error("Не удалось загрузить изображение"));
      };

      img.src = result;
    };

    reader.onerror = () => {
      reject(new Error("Ошибка при чтении файла"));
    };

    try {
      reader.readAsDataURL(file);
    } catch (readError) {
      reject(new Error("Не удалось начать чтение файла"));
    }
  });
}

function buildSearchQueries(features: IdentifyResult): string[] {
  const subject = features.primarySubject.trim();
  const kw = (features.visualKeywords || []).slice(0, 5);
  const loc = features.locationClues?.trim() || null;
  const type = features.objectType;

  const typeWords: Record<string, { ru: string[]; en: string[] }> = {
    painting: { ru: ["картина", "портрет", "музей", "художник"], en: ["painting", "portrait", "museum", "artist", "artwork"] },
    sculpture: { ru: ["скульптура", "музей", "художник"], en: ["sculpture", "museum", "artist", "artwork"] },
    art_object: { ru: ["инсталляция", "публичное искусство", "скульптура"], en: ["installation", "public art", "sculpture", "artist"] },
    architecture: { ru: ["здание", "собор", "храм", "башня", "достопримечательность"], en: ["building", "cathedral", "church", "tower", "landmark", "architect"] },
    museum_exhibit: { ru: ["экспонат", "музей"], en: ["museum exhibit", "museum"] },
    historical_landmark: { ru: ["памятник", "достопримечательность"], en: ["historical landmark", "monument"] },
    religious_building: { ru: ["храм", "собор", "церковь"], en: ["church", "cathedral", "temple"] },
    urban_space: { ru: ["городское пространство", "площадь"], en: ["urban space", "square", "plaza"] },
    nature: { ru: ["национальный парк", "тропа", "гора", "побережье"], en: ["national park", "trail", "viewpoint", "mountain", "coast"] },
    other: { ru: ["объект", "достопримечательность"], en: ["landmark", "place"] },
  };
  const words = typeWords[type] || typeWords.other;

  const baseRu = [subject, ...kw].filter(Boolean).join(" ");
  const baseEn = [subject, ...kw].filter(Boolean).join(" ");
  const queries: string[] = [];
  if (baseRu) queries.push([baseRu, ...words.ru.slice(0, 3)].join(" "));
  if (baseEn) queries.push([baseEn, ...words.en.slice(0, 3)].join(" "));
  if (loc && baseRu) queries.push(`${baseRu} ${loc}`);
  if (loc && baseEn) queries.push(`${baseEn} ${loc}`);
  if (features.textOnObject?.trim()) queries.push(features.textOnObject.trim());
  return [...new Set(queries)].slice(0, 5);
}

export default function PhotoV2Page() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [tourResult, setTourResult] = useState<TourResult | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loadingIdentify, setLoadingIdentify] = useState(false);
  const [loadingResolve, setLoadingResolve] = useState(false);
  const [loadingTour, setLoadingTour] = useState(false);
  const [loadingFollowup, setLoadingFollowup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = async (file: File | null) => {
    if (!file) return;

    try {
      // Сбрасываем всё состояние
      setImageDataUrl(null);
      setIdentifyResult(null);
      setResolveResult(null);
      setTourResult(null);
      setMessages([]);
      setUserInput("");
      setError(null);

      // Оптимизируем изображение
      const optimized = await optimizeImage(file);
      setImageDataUrl(optimized);

      // Этап 1: Определение объекта
      setLoadingIdentify(true);
      setError(null);

      const identifyResponse = await fetch("/api/photo/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: optimized,
          settings: {
            tone: "balanced",
            audience: "adult",
          },
        }),
      });

      if (!identifyResponse.ok) {
        const errorData = await identifyResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось определить объект");
      }

      const identifyData = await identifyResponse.json();
      setIdentifyResult(identifyData);
      setLoadingIdentify(false);

      // Этап 2: Сначала поиск по картинке (Google Lens) — смотрим подписи к совпавшим изображениям
      let resolved: ResolveResult | null = null;
      setLoadingResolve(true);

      const lensResponse = await fetch("/api/search/lens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: optimized }),
      });
      const lensJson = await lensResponse.json();

      if (!lensJson.disabled && lensResponse.ok) {
        // Основной путь: поиск по картинке (Lens) → resolve по подписям к совпавшим изображениям
        const resolveResponse = await fetch("/api/photo/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identify: identifyData,
            lens: lensJson,
          }),
        });
        if (resolveResponse.ok) {
          resolved = await resolveResponse.json();
          setResolveResult(resolved);
        }
      } else {
        // Fallback: если Lens недоступен (нет PUBLIC_BASE_URL и т.д.) — текстовый веб-поиск
        const queries = buildSearchQueries(identifyData);
        const searchResponse = await fetch("/api/search/web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries }),
        });
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const resolveResponse = await fetch("/api/photo/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              features: identifyData,
              searchResults: searchData.results || [],
            }),
          });
          if (resolveResponse.ok) {
            resolved = await resolveResponse.json();
            setResolveResult(resolved);
          }
        }
      }
      setLoadingResolve(false);

      // Этап 3: Экскурсия (по resolve или по identify)
      setLoadingTour(true);
      const objectName = resolved?.objectName ?? identifyData.primarySubject;
      const objectType = resolved?.objectType ?? identifyData.objectType;
      const tourPayload: Record<string, unknown> = {
        imageDataUrl: optimized,
        objectName,
        objectType,
        settings: { tone: "balanced", audience: "adult" },
      };
      if (resolved) {
        tourPayload.resolveResult = {
          objectName: resolved.objectName,
          objectType: resolved.objectType,
          locationHint: resolved.locationHint,
          sources: resolved.sources,
          confidence: resolved.confidence,
        };
      }

      const tourResponse = await fetch("/api/photo/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tourPayload),
      });

      if (!tourResponse.ok) {
        const errorData = await tourResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось создать экскурсию");
      }

      const tourData = await tourResponse.json();
      setTourResult(tourData);
      setLoadingTour(false);
    } catch (error) {
      console.error("Failed to process image:", error);
      setError(error instanceof Error ? error.message : "Неизвестная ошибка");
      setLoadingIdentify(false);
      setLoadingResolve(false);
      setLoadingTour(false);
    }
  };

  const handleCaptureClick = () => {
    captureInputRef.current?.click();
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleCaptureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
    e.target.value = "";
  };

  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
    e.target.value = "";
  };

  const handleSendFollowup = async (text: string) => {
    if (!imageDataUrl || !identifyResult || !tourResult) {
      console.warn("Cannot send followup: missing data");
      return;
    }

    const messageText = text.trim();
    if (!messageText) return;

    const userMessage: Message = { role: "user", content: messageText };
    const newMessages = [...messages, userMessage].slice(-10);
    setMessages(newMessages);
    setLoadingFollowup(true);
    setUserInput("");
    setError(null);

    const objectName = resolveResult?.objectName ?? identifyResult.primarySubject;
    const objectType = resolveResult?.objectType ?? identifyResult.objectType;
    const payload: Record<string, unknown> = {
      imageDataUrl,
      objectName,
      objectType,
      messages: newMessages,
      settings: { tone: "balanced", audience: "adult" },
    };
    if (resolveResult) {
      payload.resolveResult = {
        objectName: resolveResult.objectName,
        objectType: resolveResult.objectType,
        locationHint: resolveResult.locationHint,
        sources: resolveResult.sources,
      };
    }

    try {
      const response = await fetch("/api/photo/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось получить ответ");
      }

      const data = await response.json();
      const assistantMessage: Message = { role: "assistant", content: data.tourText || data.title || "Извините, не удалось получить ответ." };
      setMessages([...newMessages, assistantMessage].slice(-12));
      setLoadingFollowup(false);
    } catch (error) {
      console.error("Followup error:", error);
      setError(error instanceof Error ? error.message : "Произошла ошибка");
      setLoadingFollowup(false);
      const errorMessage: Message = {
        role: "assistant",
        content: error instanceof Error ? error.message : "Произошла ошибка. Попробуйте ещё раз.",
      };
      setMessages([...newMessages, errorMessage].slice(-12));
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendFollowup(userInput);
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "text-green-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-red-600";
      default:
        return "text-slate-600";
    }
  };

  const getConfidenceText = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "Высокая";
      case "medium":
        return "Средняя";
      case "low":
        return "Низкая";
      default:
        return confidence;
    }
  };

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">
          Экскурсия по фото версия 2
        </h1>
        <Link
          href={ROUTES.home}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          назад
        </Link>
      </header>

      <div className="mb-4 flex gap-2">
        <button
          onClick={handleCaptureClick}
          className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-slate-800"
        >
          Сделать фото
        </button>
        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCaptureChange}
          className="hidden"
        />

        <button
          onClick={handleUploadClick}
          className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition active:scale-[0.98] hover:bg-slate-50"
        >
          Загрузить фото
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadChange}
          className="hidden"
        />
      </div>

      {imageDataUrl && (
        <div className="mb-4 rounded-2xl overflow-hidden border border-slate-200">
          <img
            src={imageDataUrl}
            alt="Preview"
            className="w-full h-auto max-h-[200px] object-contain bg-slate-50"
          />
        </div>
      )}

      {loadingIdentify && (
        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-slate-500">Определяю объект...</p>
        </div>
      )}

      {loadingResolve && (
        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-slate-500">Ищу совпадения по картинке (Google Lens)…</p>
        </div>
      )}

      {identifyResult && (
        <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-1">
            Этот объект: <span className="font-semibold text-slate-900">{identifyResult.primarySubject}</span>
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">Уверенность:</span>
            <span className={`text-xs font-medium ${getConfidenceColor(identifyResult.confidence)}`}>
              {getConfidenceText(identifyResult.confidence)}
            </span>
          </div>
          {(identifyResult.stylePeriodHint || (identifyResult.visualKeywords?.length > 0)) && (
            <p className="text-xs text-slate-500 mt-1">
              {[identifyResult.stylePeriodHint, identifyResult.visualKeywords?.slice(0, 5).join(", ")].filter(Boolean).join(" • ")}
            </p>
          )}
          {identifyResult.textOnObject && (
            <p className="text-xs text-slate-500 mt-1 italic">Надпись: {identifyResult.textOnObject}</p>
          )}
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
          {resolveResult.why && (
            <p className="text-xs text-slate-600 mt-1">{resolveResult.why}</p>
          )}
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

      {loadingTour && (
        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-slate-500">Готовлю экскурсию...</p>
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
          {(tourResult.sources && tourResult.sources.length > 0) && (
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
              className={`rounded-2xl px-3 py-2 ${
                msg.role === "user"
                  ? "bg-slate-50 text-slate-900 ml-auto text-right"
                  : "bg-slate-900 text-white"
              }`}
            >
              <p className="text-xs">{msg.content}</p>
            </div>
          ))}
        </div>
      )}

      {loadingFollowup && (
        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-slate-500">Думаю...</p>
        </div>
      )}

      {tourResult && (
        <form onSubmit={handleTextSubmit} className="mt-auto space-y-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Задайте уточняющий вопрос..."
            disabled={loadingFollowup}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!userInput.trim() || loadingFollowup}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
          >
            Спросить
          </button>
        </form>
      )}

      {!imageDataUrl && (
        <div className="mt-auto text-center">
          <p className="text-sm text-slate-500">
            Сделайте или загрузите фото, чтобы начать экскурсию
          </p>
        </div>
      )}

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
