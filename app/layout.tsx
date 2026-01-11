import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Кизер — ИИ-экскурсовод",
  description: "Минимальный прототип мобильного интерфейса «Кизер — ИИ-экскурсовод».",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <div className="flex min-h-screen items-center justify-center px-4 py-6">
          {children}
        </div>
      </body>
    </html>
  );
}

