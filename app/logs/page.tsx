"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  clearStoredLogs,
  exportStoredLogsJson,
  getRuntimeAccountsSnapshot,
  getStoredLogCount,
  getTechLogs,
  techLog,
  type TechLogCategory,
  type TechLogEntry,
  type TechLogLevel,
} from "../../lib/logging";
import { ROUTES } from "../../lib/constants/routes";

const LEVELS: Array<TechLogLevel | "all"> = ["all", "debug", "info", "warn", "error"];
const CATEGORIES: Array<TechLogCategory | "all"> = [
  "all",
  "system",
  "navigation",
  "api",
  "speech",
  "tts",
  "ui",
  "settings",
  "error",
  "performance",
];

function levelClass(level: TechLogLevel): string {
  switch (level) {
    case "error":
      return "text-red-700 bg-red-50 border-red-200";
    case "warn":
      return "text-amber-800 bg-amber-50 border-amber-200";
    case "debug":
      return "text-slate-600 bg-slate-50 border-slate-200";
    default:
      return "text-slate-800 bg-white border-slate-200";
  }
}

function LogEntryCard({ entry }: { entry: TechLogEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <article className={`rounded-xl border px-3 py-2 ${levelClass(entry.level)}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-slate-500">{entry.tsLocal}</p>
            <p className="text-sm font-semibold break-words">
              [{entry.category}] {entry.action}
            </p>
            {entry.message && <p className="mt-0.5 text-xs break-words text-slate-700">{entry.message}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
            {entry.level}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
          {entry.path && <span>{entry.path}</span>}
          {entry.durationMs != null && <span>{entry.durationMs} ms</span>}
          {entry.sessionId && <span>session: {entry.sessionId}</span>}
        </div>
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-200/80 pt-2 text-xs">
          {entry.urls && entry.urls.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-slate-600">Ссылки / URL</p>
              <ul className="space-y-1">
                {entry.urls.map((url) => (
                  <li key={url} className="break-all font-mono">
                    {url.startsWith("http") ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                        {url}
                      </a>
                    ) : (
                      url
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.accounts && Object.keys(entry.accounts).length > 0 && (
            <div>
              <p className="mb-1 font-medium text-slate-600">Аккаунты / окружение</p>
              <dl className="grid grid-cols-1 gap-1 font-mono">
                {Object.entries(entry.accounts).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="break-all text-slate-800">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <p className="mb-1 font-medium text-slate-600">Детали</p>
              <pre className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function LogsPageContent() {
  const [entries, setEntries] = useState<TechLogEntry[]>([]);
  const [level, setLevel] = useState<TechLogLevel | "all">("all");
  const [category, setCategory] = useState<TechLogCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setEntries(getTechLogs({ level, category, query }));
  }, [level, category, query]);

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("kizer-tech-log-updated", onUpdate);
    return () => window.removeEventListener("kizer-tech-log-updated", onUpdate);
  }, [refresh]);

  const accounts = useMemo(() => getRuntimeAccountsSnapshot(), []);

  const handleClear = () => {
    if (!window.confirm("Очистить все сохранённые логи?")) return;
    clearStoredLogs();
    refresh();
    setMessage("Логи очищены");
  };

  const handleExport = async () => {
    const json = exportStoredLogsJson();
    try {
      await navigator.clipboard.writeText(json);
      setMessage(`Скопировано ${getStoredLogCount()} записей в буфер`);
    } catch {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kizer-logs-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("JSON файл скачан");
    }
  };

  const handleTestLog = () => {
    techLog({
      level: "info",
      category: "ui",
      action: "logs.test",
      message: "Тестовая запись из страницы логов",
      accounts,
    });
    refresh();
    setMessage("Тестовая запись добавлена");
  };

  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-4 pb-4 pt-5 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Технический лог</h1>
          <p className="text-xs text-slate-500">{entries.length} записей (всего {getStoredLogCount()})</p>
        </div>
        <Link href={ROUTES.home} className="text-sm text-slate-500 hover:text-slate-700">
          назад
        </Link>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
        >
          Экспорт JSON
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          Очистить
        </button>
        <button
          type="button"
          onClick={refresh}
          className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
        >
          Обновить
        </button>
        <button
          type="button"
          onClick={handleTestLog}
          className="rounded-xl border border-slate-300 bg-slate-900 px-3 py-2 text-xs font-medium text-white"
        >
          Тест-запись
        </button>
      </div>

      <div className="mb-3 space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по действиям, URL, тексту…"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as TechLogLevel | "all")}
            className="rounded-xl border border-slate-300 px-2 py-2 text-xs"
          >
            {LEVELS.map((item) => (
              <option key={item} value={item}>
                level: {item}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TechLogCategory | "all")}
            className="rounded-xl border border-slate-300 px-2 py-2 text-xs"
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>
      )}

      <section className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-medium text-slate-600">Текущее окружение</p>
        <dl className="max-h-28 space-y-1 overflow-y-auto text-[10px] font-mono">
          {Object.entries(accounts).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[minmax(0,42%)_1fr] gap-2">
              <dt className="text-slate-500">{key}</dt>
              <dd className="break-all text-slate-800">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            Пока нет записей. Используйте приложение — действия сохраняются автоматически.
          </p>
        ) : (
          entries.map((entry) => <LogEntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </main>
  );
}

export default function LogsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[640px] w-full max-w-[390px] items-center justify-center rounded-[32px] bg-white px-5 shadow border border-slate-200">
          <p className="text-sm text-slate-500">Загрузка логов…</p>
        </main>
      }
    >
      <LogsPageContent />
    </Suspense>
  );
}
