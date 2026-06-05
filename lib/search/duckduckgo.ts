import type { SerpApiSearchItem } from "./serpapi";

const MAX_RESULTS = 8;

/** Бесплатный веб-поиск без API-ключа (fallback, если нет SerpAPI). */
export async function searchDuckDuckGo(query: string): Promise<SerpApiSearchItem[]> {
  const params = new URLSearchParams({ q: query, format: "json", no_redirect: "1", no_html: "1" });
  const res = await fetch(`https://api.duckduckgo.com/?${params.toString()}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo error: ${res.status}`);
  }

  const data = (await res.json()) as {
    Heading?: string;
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<
      | { Text?: string; FirstURL?: string }
      | { Name?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }
    >;
  };

  const items: SerpApiSearchItem[] = [];

  if (data.AbstractText && data.AbstractURL) {
    items.push({
      title: data.Heading || query,
      snippet: data.AbstractText,
      url: data.AbstractURL,
    });
  }

  const topics = data.RelatedTopics ?? [];
  for (const topic of topics) {
    if (items.length >= MAX_RESULTS) break;
    if ("Topics" in topic && Array.isArray(topic.Topics)) {
      for (const sub of topic.Topics) {
        if (items.length >= MAX_RESULTS) break;
        if (sub.Text && sub.FirstURL) {
          items.push({
            title: sub.Text.split(" - ")[0] || sub.Text,
            snippet: sub.Text,
            url: sub.FirstURL,
          });
        }
      }
      continue;
    }
    if ("Text" in topic && topic.Text && topic.FirstURL) {
      items.push({
        title: topic.Text.split(" - ")[0] || topic.Text,
        snippet: topic.Text,
        url: topic.FirstURL,
      });
    }
  }

  return items.slice(0, MAX_RESULTS);
}
