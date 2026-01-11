"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ROUTES } from "../../lib/constants/routes";

type PromptsConfig = {
  questions: {
    systemPrompt: string;
    userPromptTemplate: string;
  };
  photo: {
    systemPrompt: string;
  };
  settings: {
    defaultTone: "scientific" | "balanced" | "entertainment";
    defaultAudience: "adult" | "child";
  };
};

export default function AdminPage() {
  const [config, setConfig] = useState<PromptsConfig | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<"configured" | "not configured">("not configured");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/admin/prompts");
      if (!response.ok) throw new Error("Failed to load");
      const data = await response.json();
      setConfig(data.config);
      setApiKeyStatus(data.apiKeyStatus);
    } catch (error) {
      console.error("Failed to load config:", error);
      setMessage({ type: "error", text: "Не удалось загрузить конфигурацию" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) throw new Error("Failed to save");

      setMessage({ type: "success", text: "Конфигурация сохранена" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save config:", error);
      setMessage({ type: "error", text: "Не удалось сохранить конфигурацию" });
    } finally {
      setSaving(false);
    }
  };

  const handleCheckKey = async () => {
    setChecking(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/check-key");
      if (!response.ok) throw new Error("Failed to check");

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message || "API ключ работает корректно" });
      } else {
        setMessage({ type: "error", text: data.error || "Ошибка при проверке ключа" });
      }

      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error("Failed to check key:", error);
      setMessage({ type: "error", text: "Не удалось проверить API ключ" });
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
        <p className="text-center text-sm text-slate-500">Загрузка...</p>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
        <p className="text-center text-sm text-red-500">Ошибка загрузки конфигурации</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Админка</h1>
        <Link
          href={ROUTES.home}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          назад
        </Link>
      </header>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-700 mb-1">Статус API ключей</p>
        <p className="text-sm text-slate-600 mb-2">
          OPENAI_API_KEY:{" "}
          <span className={apiKeyStatus === "configured" ? "text-green-600" : "text-red-600"}>
            {apiKeyStatus === "configured" ? "configured" : "not configured"}
          </span>
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Ключ задаётся вручную в .env.local
        </p>
        <button
          onClick={handleCheckKey}
          disabled={checking || apiKeyStatus === "not configured"}
          className="w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
        >
          {checking ? "Проверка..." : "Проверить API ключ"}
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-4 space-y-4 flex-1 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            System Prompt (для режима "Экскурсия по вопросам")
          </label>
          <textarea
            value={config.questions.systemPrompt}
            onChange={(e) =>
              setConfig({
                ...config,
                questions: { ...config.questions, systemPrompt: e.target.value },
              })
            }
            rows={8}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 resize-none"
            placeholder="Введите system prompt..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            User Prompt Template
          </label>
          <textarea
            value={config.questions.userPromptTemplate}
            onChange={(e) =>
              setConfig({
                ...config,
                questions: { ...config.questions, userPromptTemplate: e.target.value },
              })
            }
            rows={3}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 resize-none"
            placeholder="Введите шаблон user prompt (используйте {message} для вставки вопроса)..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            System Prompt (для режима "Экскурсия по фото")
          </label>
          <textarea
            value={config.photo?.systemPrompt || ""}
            onChange={(e) =>
              setConfig({
                ...config,
                photo: { systemPrompt: e.target.value },
              })
            }
            rows={8}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 resize-none"
            placeholder="Введите system prompt для режима фото..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Тональность по умолчанию
          </label>
          <select
            value={config.settings.defaultTone}
            onChange={(e) =>
              setConfig({
                ...config,
                settings: {
                  ...config.settings,
                  defaultTone: e.target.value as "scientific" | "balanced" | "entertainment",
                },
              })
            }
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          >
            <option value="scientific">Научная</option>
            <option value="balanced">Сбалансированная</option>
            <option value="entertainment">Развлекательная</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Аудитория по умолчанию
          </label>
          <select
            value={config.settings.defaultAudience}
            onChange={(e) =>
              setConfig({
                ...config,
                settings: {
                  ...config.settings,
                  defaultAudience: e.target.value as "adult" | "child",
                },
              })
            }
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          >
            <option value="adult">Взрослая</option>
            <option value="child">Детская</option>
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>

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
