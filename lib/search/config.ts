export type SearchProvider = "serpapi" | "bing" | "duckduckgo";

export function getSearchProvider(): SearchProvider {
  const configured = process.env.SEARCH_PROVIDER?.trim().toLowerCase();
  if (configured === "bing" && process.env.BING_SEARCH_API_KEY?.trim()) return "bing";
  if (configured === "duckduckgo") return "duckduckgo";
  if (process.env.SERPAPI_API_KEY?.trim()) return "serpapi";
  if (process.env.BING_SEARCH_API_KEY?.trim()) return "bing";
  return "duckduckgo";
}

export function isSearchConfigured(): boolean {
  const provider = getSearchProvider();
  if (provider === "serpapi") return !!process.env.SERPAPI_API_KEY?.trim();
  if (provider === "bing") return !!process.env.BING_SEARCH_API_KEY?.trim();
  return true;
}
