import Link from "next/link";
import { TtsSettingsPanel } from "../../components/tts/TtsSettingsPanel";
import { ROUTES } from "../../lib/constants/routes";

export default function SettingsPage() {
  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Настройки</h1>
        <Link href={ROUTES.home} className="text-sm text-slate-500 hover:text-slate-700">
          назад
        </Link>
      </header>

      <div className="mt-6 flex flex-1 flex-col overflow-y-auto">
        <TtsSettingsPanel />
      </div>

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
