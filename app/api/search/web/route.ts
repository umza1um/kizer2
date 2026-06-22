import { NextRequest, NextResponse } from "next/server";
import {
  getSearchProvider,
  isSearchConfigured,
  searchNotConfiguredMessage,
} from "../../../../lib/search/config";
import { searchGoogleCse } from "../../../../lib/search/google";
import { searchSerpApi } from "../../../../lib/search/serpapi";

export type WebSearchItem = { title: string; snippet: string; url: string };
export type WebSearchResult = { query: string; items: WebSearchItem[] };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, { data: WebSearchResult[]; expires: number }>();

function cacheKey(queries: string[]): string {
  return queries.slice().sort().join("\n");
}

async function runSearch(query: string): Promise<WebSearchItem[]> {
  const provider = getSearchProvider();

  if (provider === "google") {
    const apiKey = process.env.GOOGLE_CSE_API_KEY?.trim();
    const cx = process.env.GOOGLE_CSE_CX?.trim();
    if (!apiKey || !cx) throw new Error("Google CSE not configured");
    return searchGoogleCse(query, apiKey, cx);
  }

  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("SERPAPI_API_KEY not configured");
  return searchSerpApi(query, apiKey);
}

export async function POST(request: NextRequest) {
  try {
    if (!isSearchConfigured()) {
      return NextResponse.json(
        { error: searchNotConfiguredMessage() },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { queries } = body as { queries?: string[] };

    if (!Array.isArray(queries) || queries.length === 0) {
      return NextResponse.json(
        { error: "queries array is required (non-empty)" },
        { status: 400 },
      );
    }

    const key = cacheKey(queries);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expires > now) {
      return NextResponse.json({ results: cached.data });
    }

    const provider = getSearchProvider();
    const results: WebSearchResult[] = [];
    const maxQueries = Math.min(queries.length, 5);
    for (let i = 0; i < maxQueries; i++) {
      const q = String(queries[i]).trim();
      if (!q) continue;
      try {
        const items = await runSearch(q);
        results.push({ query: q, items });
      } catch (err) {
        console.warn(`${provider} query failed:`, q, err);
        results.push({ query: q, items: [] });
      }
    }

    cache.set(key, { data: results, expires: now + CACHE_TTL_MS });
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Web search API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Web search failed" },
      { status: 500 },
    );
  }
}
