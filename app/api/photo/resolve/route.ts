import { NextRequest, NextResponse } from "next/server";
import { openai } from "../../../../lib/openai/client";
import { loadPrompts } from "../../../../lib/config/prompts";

export type ResolveResult = {
  objectName: string;
  objectType: string;
  locationHint: string | null;
  confidence: "high" | "medium" | "low";
  why: string;
  sources: string[];
  canonicalPage?: string | null;
};

type SearchItem = { title: string; snippet: string; url: string };
type SearchResult = { query: string; items: SearchItem[] };
type LensPayload = {
  bestGuess?: string | null;
  visualMatches?: Array<{ title: string; source: string; link: string }>;
  pagesWithMatches?: Array<{ title: string; link: string; snippet: string }>;
  rawTopLinks?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identify, lens, features, searchResults } = body as {
      identify?: Record<string, unknown>;
      lens?: LensPayload | null;
      features?: Record<string, unknown>;
      searchResults?: SearchResult[];
    };

    const hasLensData = lens != null && !(lens as { disabled?: boolean }).disabled &&
      ((lens as LensPayload).visualMatches?.length || (lens as LensPayload).rawTopLinks?.length);
    const useLens = identify && hasLensData;
    const useWeb = features && Array.isArray(searchResults);
    const useIdentifyOnly = identify && !useLens && !useWeb;

    if (!useLens && !useWeb && !useIdentifyOnly) {
      return NextResponse.json(
        { error: "Either (identify + lens?), (identify only), or (features + searchResults) is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const config = loadPrompts();
    const resolvePrompt = config.photo.resolvePrompt ||
      "По признакам и результатам поиска (или Google Lens) выбери наиболее вероятную идентификацию. Верни JSON: objectName, objectType, confidence, why, sources (2–5 URL только из выдачи), canonicalPage (один лучший URL или null). Не выдумывай источники. objectType — один из: painting, sculpture, art_object, architecture, museum_exhibit, historical_landmark, religious_building, urban_space, nature, other.";

    let userContent: string;
    let fallbackSubject: string;
    let fallbackType: string;

    if (useLens) {
      fallbackSubject = String((identify as { primarySubject?: string }).primarySubject ?? "Не определено");
      fallbackType = String((identify as { objectType?: string }).objectType ?? "other");
      const lensPayload = lens as LensPayload;
      const lensText = [
        lensPayload.bestGuess ? `Best guess: ${lensPayload.bestGuess}` : "",
        "Visual matches:",
        ...(lensPayload.visualMatches ?? []).slice(0, 8).map((v) => `- ${v.title} | ${v.source} | ${v.link}`),
        "Pages with matches:",
        ...(lensPayload.pagesWithMatches ?? []).slice(0, 8).map((p) => `- ${p.title} | ${p.link} | ${p.snippet || ""}`),
        "Links:",
        ...(lensPayload.rawTopLinks ?? []).slice(0, 15),
      ].filter(Boolean).join("\n");
      userContent = `Identify (vision) JSON:\n${JSON.stringify(identify, null, 2)}\n\nGoogle Lens results:\n${lensText}\n\nВыбери лучшее совпадение. sources — только URL из списка выше (2–5). Верни JSON с objectName, objectType, confidence, why, sources, canonicalPage.`;
    } else if (useIdentifyOnly) {
      fallbackSubject = String((identify as { primarySubject?: string }).primarySubject ?? "Не определено");
      fallbackType = String((identify as { objectType?: string }).objectType ?? "other");
      userContent = `По признакам с фото (identify) определи объект. Верни JSON: objectName (можно primarySubject), objectType, confidence, why, sources (пустой массив), canonicalPage (null). Identify:\n${JSON.stringify(identify, null, 2)}`;
    } else {
      fallbackSubject = String((features as { primarySubject?: string }).primarySubject ?? "Не определено");
      fallbackType = String((features as { objectType?: string }).objectType ?? "other");
      const searchText = (searchResults as SearchResult[])
        .map(
          (r) =>
            `Запрос: ${r.query}\nРезультаты:\n${r.items
              .map((i) => `- ${i.title}\n  ${i.snippet || ""}\n  URL: ${i.url}`)
              .join("\n")}`
        )
        .join("\n\n");
      userContent = `Визуальные признаки (JSON):\n${JSON.stringify(features, null, 2)}\n\nРезультаты веб-поиска:\n${searchText}\n\nВыбери лучшее совпадение и верни JSON.`;
    }

    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: resolvePrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_output_tokens: 600,
    } as any);

    const content = response.output_text;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    let result: ResolveResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]) as ResolveResult;
      } else {
        throw new Error("No JSON in response");
      }
    } catch (parseError) {
      result = {
        objectName: fallbackSubject,
        objectType: fallbackType,
        locationHint: null,
        confidence: "low",
        why: "Не удалось разобрать ответ модели",
        sources: [],
        canonicalPage: null,
      };
    }

    if (!result.objectName || !result.objectType) {
      result.objectName = result.objectName || fallbackSubject;
      result.objectType = result.objectType || fallbackType;
    }
    if (!Array.isArray(result.sources)) result.sources = [];
    if (result.canonicalPage === undefined) result.canonicalPage = null;

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Resolve API error:", error);
    const message = error instanceof Error ? error.message : "Resolve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
