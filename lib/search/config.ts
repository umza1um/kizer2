export type SearchProvider = "serpapi" | "google";

function hasSerpApiKey(): boolean {
  return !!process.env.SERPAPI_API_KEY?.trim();
}

function hasGoogleCse(): boolean {
  return !!(
    process.env.GOOGLE_CSE_API_KEY?.trim() && process.env.GOOGLE_CSE_CX?.trim()
  );
}

export function getSearchProvider(): SearchProvider {
  const configured = process.env.SEARCH_PROVIDER?.trim().toLowerCase();

  if (configured === "google" && hasGoogleCse()) return "google";
  if (configured === "serpapi" && hasSerpApiKey()) return "serpapi";

  if (hasSerpApiKey()) return "serpapi";
  if (hasGoogleCse()) return "google";

  return "serpapi";
}

export function isSearchConfigured(): boolean {
  const provider = getSearchProvider();
  if (provider === "google") return hasGoogleCse();
  return hasSerpApiKey();
}

export function searchNotConfiguredMessage(): string {
  const configured = process.env.SEARCH_PROVIDER?.trim().toLowerCase() || "serpapi";
  if (configured === "google") {
    return "Задайте GOOGLE_CSE_API_KEY и GOOGLE_CSE_CX в .env.local / Vercel.";
  }
  return "Задайте SERPAPI_API_KEY (рекомендуется) или GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX в .env.local / Vercel.";
}
