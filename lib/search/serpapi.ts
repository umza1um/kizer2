/**
 * SerpAPI Google Search — только на сервере.
 * Ключ: process.env.SERPAPI_API_KEY
 */

export type SerpApiSearchItem = {
  title: string;
  snippet: string;
  url: string;
};

const MAX_RESULTS_PER_QUERY = 8;
const SERPAPI_BASE = "https://serpapi.com/search";

export async function searchSerpApi(
  query: string,
  apiKey: string
): Promise<SerpApiSearchItem[]> {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
  });
  const url = `${SERPAPI_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SerpAPI error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    error?: string;
    organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
  };
  if (data.error) {
    throw new Error(`SerpAPI: ${data.error}`);
  }
  const organic = data.organic_results ?? [];
  return organic.slice(0, MAX_RESULTS_PER_QUERY).map((r) => ({
    title: r.title ?? "",
    snippet: r.snippet ?? "",
    url: r.link ?? "",
  }));
}
