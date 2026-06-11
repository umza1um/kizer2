"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { installTechLogging, techLog } from "../../lib/logging";
import { getRuntimeAccountsSnapshot } from "../../lib/logging/context";

export function LogBootstrap() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const installedRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (installedRef.current) return;
    installedRef.current = true;
    installTechLogging();
  }, []);

  useEffect(() => {
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;

    techLog({
      level: "info",
      category: "navigation",
      action: "page.view",
      message: path,
      urls: [path],
      path,
      accounts: getRuntimeAccountsSnapshot(),
      metadata: {
        referrer: typeof document !== "undefined" ? document.referrer || null : null,
      },
    });
  }, [pathname, searchParams]);

  return null;
}
