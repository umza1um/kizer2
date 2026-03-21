import { NextRequest, NextResponse } from "next/server";
import { putImage, makePublicImageUrl } from "../../../../lib/photoStore";

export type LensVisualMatch = { title: string; source: string; link: string };
export type LensPageMatch = { title: string; link: string; snippet: string };

export type LensResult = {
  publicUrl: string;
  bestGuess: string | null;
  visualMatches: LensVisualMatch[];
  pagesWithMatches: LensPageMatch[];
  rawTopLinks: string[];
};

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].trim() || "image/jpeg";
  const base64 = match[2];
  try {
    const buffer = Buffer.from(base64, "base64");
    return buffer.length > 0 ? { buffer, mime } : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.SERPAPI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { disabled: true, reason: "SERPAPI_API_KEY not configured" },
        { status: 200 }
      );
    }
    const publicUrl = makePublicImageUrl("dummy");
    if (!publicUrl) {
      return NextResponse.json(
        { disabled: true, reason: "PUBLIC_BASE_URL not set. Set PUBLIC_BASE_URL (e.g. ngrok or Vercel URL) for Google Lens." },
        { status: 200 }
      );
    }

    const body = await request.json();
    const imageDataUrl = body?.imageDataUrl;
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
        { status: 400 }
      );
    }

    const decoded = dataUrlToBuffer(imageDataUrl);
    if (!decoded) {
      return NextResponse.json(
        { error: "Invalid image data URL" },
        { status: 400 }
      );
    }

    const id = putImage(decoded.buffer, decoded.mime);
    const finalPublicUrl = makePublicImageUrl(id);
    if (!finalPublicUrl) {
      return NextResponse.json(
        { disabled: true, reason: "PUBLIC_BASE_URL not set" },
        { status: 200 }
      );
    }

    const params = new URLSearchParams({
      engine: "google_lens",
      url: finalPublicUrl,
      api_key: apiKey,
    });
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!res.ok) {
      return NextResponse.json(
        { error: `SerpAPI error: ${res.status}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      error?: string;
      visual_matches?: Array<{ title?: string; link?: string; source?: string }>;
      related_content?: Array<{ query?: string; link?: string }>;
      search_metadata?: { status?: string };
    };

    if (data.error) {
      return NextResponse.json(
        { error: data.error },
        { status: 502 }
      );
    }

    const visualMatchesRaw = data.visual_matches ?? [];
    const visualMatches: LensVisualMatch[] = visualMatchesRaw
      .slice(0, 8)
      .map((v) => ({
        title: String(v.title ?? ""),
        source: String(v.source ?? ""),
        link: String(v.link ?? ""),
      }))
      .filter((v) => v.link);

    const pagesWithMatches: LensPageMatch[] = visualMatchesRaw
      .slice(0, 8)
      .map((v) => ({
        title: String(v.title ?? ""),
        link: String(v.link ?? ""),
        snippet: String(v.title ?? ""),
      }))
      .filter((p) => p.link);

    const rawTopLinks = visualMatchesRaw
      .map((v) => v.link)
      .filter((l): l is string => typeof l === "string" && l.length > 0);

    let bestGuess: string | null = null;
    const related = data.related_content ?? [];
    if (related[0]?.query) bestGuess = String(related[0].query);
    else if (visualMatches[0]?.title) bestGuess = visualMatches[0].title;

    const result: LensResult = {
      publicUrl: finalPublicUrl,
      bestGuess,
      visualMatches,
      pagesWithMatches,
      rawTopLinks,
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lens API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lens search failed" },
      { status: 500 }
    );
  }
}
