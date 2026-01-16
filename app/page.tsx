import Link from "next/link";
import { ROUTES } from "../lib/constants/routes";
import { Button } from "../components/ui/Button";

export default function Home() {
  return (
    <main className="flex min-h-[640px] w-full max-w-[390px] flex-col rounded-[32px] bg-white px-5 pb-4 pt-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] border border-slate-200">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-[28px] font-semibold tracking-[0.18em] text-slate-900">
          КИЗЕР
          </h1>
        <p className="text-xs tracking-[0.26em] text-slate-500">
          ИИ ЭКСКУРСОВОД
        </p>
      </header>

      <section className="mt-8 flex flex-1 flex-col gap-4">
        <Link href={ROUTES.questions} className="block">
          <div className="flex flex-col gap-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm active:scale-[0.99] transition">
            <span className="text-[13px] font-medium text-slate-500">
              РЕЖИМ 1
            </span>
            <span className="text-base font-semibold text-slate-900">
              ЭКСКУРСИЯ ПО ВОПРОСАМ
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Задавайте вопросы и получайте ответы как от живого экскурсовода.
            </span>
          </div>
        </Link>

        <Link href={ROUTES.photo} className="block">
          <div className="flex flex-col gap-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm active:scale-[0.99] transition">
            <span className="text-[13px] font-medium text-slate-500">
              РЕЖИМ 2
            </span>
            <span className="text-base font-semibold text-slate-900">
              ЭКСКУРСИЯ ПО ФОТО
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Показывайте фотографии экспонатов и узнайте о них больше.
            </span>
          </div>
        </Link>

        <Link href={ROUTES.geo} className="block">
          <div className="flex flex-col gap-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm active:scale-[0.99] transition">
            <span className="text-[13px] font-medium text-slate-500">
              РЕЖИМ 3
            </span>
            <span className="text-base font-semibold text-slate-900">
              ЭКСКУРСИЯ ПО ГЕОЛОКАЦИИ
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Ходите по пространству и получайте подсказки по вашему маршруту.
            </span>
          </div>
        </Link>
      </section>

      <div className="mt-5 border-t border-slate-200 pt-3 pb-[env(safe-area-inset-bottom,0px)]">
        <nav className="flex items-center justify-between gap-4 text-xs font-medium text-slate-600">
          <Link href={ROUTES.settings} className="flex-1">
            <Button
              type="button"
              fullWidth
              className="bg-slate-100 text-slate-700 shadow-none hover:bg-slate-200 active:bg-slate-200"
            >
              настройки
            </Button>
          </Link>
          <Link href={ROUTES.admin} className="flex-1">
            <Button
              type="button"
              fullWidth
              className="bg-slate-900 text-slate-50 hover:bg-slate-800"
          >
              админка
            </Button>
          </Link>
        </nav>
        </div>
      </main>
  );
}

