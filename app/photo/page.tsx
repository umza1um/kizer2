"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ROUTES } from "../../lib/constants/routes";

type Message = {
  role: "user" | "assistant";
  content: string;
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
          const maxWidth = 1280;
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

export default function PhotoPage() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [status, setStatus] = useState<"ready" | "thinking">("ready");
  const [lastAssistantText, setLastAssistantText] = useState("");

  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const hasSpeechSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (hasSpeechSynthesis) {
      synthesisRef.current = window.speechSynthesis;
    }
  }, [hasSpeechSynthesis]);

  const handleImageSelect = async (file: File | null) => {
    if (!file) return;

    try {
      setStatus("ready"); // Убеждаемся, что статус готов
      const optimized = await optimizeImage(file);
      setImageDataUrl(optimized);
      setMessages([]);
      setUserInput("");
      setLastAssistantText("");
      setStatus("ready"); // Еще раз устанавливаем статус после загрузки
    } catch (error) {
      console.error("Failed to process image:", error);
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
      alert(`Не удалось обработать изображение: ${errorMessage}`);
      setStatus("ready"); // Восстанавливаем статус при ошибке
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

  const speakText = (text: string) => {
    if (!hasSpeechSynthesis || !synthesisRef.current) return;

    synthesisRef.current.cancel();
    
    // Очищаем текст от ссылок и символов
    let cleanedText = text;
    const sourcesIndex = cleanedText.indexOf("\n\nИсточники:");
    if (sourcesIndex !== -1) {
      cleanedText = cleanedText.substring(0, sourcesIndex);
    }
    cleanedText = cleanedText
      .replace(/\*/g, "")
      .replace(/https?:\/\/[^\s]+/gi, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .trim();
    
    if (!cleanedText) return;
    
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = "ru-RU";
    
    // Настройки для более приятного голоса
    utterance.rate = 0.85;
    utterance.pitch = 1.15;
    utterance.volume = 0.95;
    
    // Пытаемся выбрать более приятный голос
    const voices = synthesisRef.current.getVoices();
    if (voices.length > 0) {
      const russianVoice = voices.find(
        (v) => v.lang.startsWith("ru") && (v.name.includes("женск") || v.name.includes("Female") || v.gender === "female")
      ) || voices.find((v) => v.lang.startsWith("ru"));
      
      if (russianVoice) {
        utterance.voice = russianVoice;
      }
    }

    utterance.onerror = () => {
      // Ignore errors silently
    };

    synthesisRef.current.speak(utterance);
  };

  const handleSendMessage = async (text: string) => {
    if (!imageDataUrl) {
      console.warn("Cannot send message: image missing");
      return;
    }

    // Если текста нет, отправляем пустую строку - системный промпт из админки сделает работу
    const messageText = text.trim() || "";
    
    // Добавляем сообщение пользователя в историю только если есть текст
    const userMessage: Message | null = messageText ? { role: "user", content: messageText } : null;
    const newMessages = userMessage 
      ? [...messages, userMessage].slice(-10)
      : messages;
    
    if (userMessage) {
      setMessages(newMessages);
    }
    setStatus("thinking");
    setUserInput("");

    try {
      console.log("Sending photo chat request...", { message: messageText || "(empty, using system prompt)", imageSize: imageDataUrl.length });
      
      const response = await fetch("/api/photo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          message: messageText,
          messages: newMessages,
          settings: {
            tone: "balanced",
            audience: "adult",
          },
        }),
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Ошибка ${response.status}: ${response.statusText}`;
        console.error("API error:", errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Response data:", data);
      
      const assistantText = data.assistantText || "Извините, не удалось получить ответ.";

      const assistantMessage: Message = { role: "assistant", content: assistantText };
      const updatedMessages = [...newMessages, assistantMessage].slice(-12);
      setMessages(updatedMessages);
      setLastAssistantText(assistantText);
      setStatus("ready");

      if (hasSpeechSynthesis) {
        setTimeout(() => {
          speakText(assistantText);
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
      setLastAssistantText("");
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(userInput);
  };

  const handleRepeat = (text?: string) => {
    const textToSpeak = text || lastAssistantText;
    if (textToSpeak) {
      speakText(textToSpeak);
    }
  };

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Экскурсия по фото</h1>
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

      {status === "thinking" && (
        <div className="mb-4 text-center">
          <p className="text-xs font-medium text-slate-500">Думаю...</p>
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
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs flex-1">{msg.content}</p>
                {msg.role === "assistant" && hasSpeechSynthesis && (
                  <button
                    onClick={() => handleRepeat(msg.content)}
                    className="text-sm hover:opacity-70 transition flex-shrink-0"
                    title="Озвучить"
                    disabled={status === "thinking"}
                  >
                    🔊
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}


      {imageDataUrl && (
        <form onSubmit={handleTextSubmit} className="mt-auto space-y-2">
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
