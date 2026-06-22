/**
 * Google Custom Search JSON API — только на сервере.
 * Ключи: GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX
 */

import type { SerpApiSearchItem } from "./serpapi";

const MAX_RESULTS = 8;
const CSE_BASE = "https://www.googleapis.com/customsearch/v1";

export async function searchGoogleCse(
  query: string,
  apiKey: string,
  cx: string,
): Promise<SerpApiSearchItem[]> {
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(MAX_RESULTS),
  });
  const res = await fetch(`${CSE_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Google CSE error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    error?: { message?: string };
    items?: Array<{ title?: string; snippet?: string; link?: string }>;
  };
  if (data.error?.message) {
    throw new Error(`Google CSE: ${data.error.message}`);
  }
  return (data.items ?? []).slice(0, MAX_RESULTS).map((r) => ({
    title: r.title ?? "",
    snippet: r.snippet ?? "",
    url: r.link ?? "",
  }));
}
