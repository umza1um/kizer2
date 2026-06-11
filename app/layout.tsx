import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { LogBootstrap } from "../components/logging/LogBootstrap";

export const metadata: Metadata = {
  title: "Кизер — ИИ-экскурсовод",
  description: "Минимальный прототип мобильного интерфейса «Кизер — ИИ-экскурсовод».",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased" suppressHydrationWarning>
        <Suspense fallback={null}>
          <LogBootstrap />
        </Suspense>
        <div className="flex min-h-screen items-center justify-center px-4 py-6">
          {children}
        </div>
      </body>
    </html>
  );
}

