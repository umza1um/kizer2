import { NextRequest, NextResponse } from "next/server";
import { loadPrompts, savePrompts, type PromptsConfig } from "../../../../lib/config/prompts";

export async function GET() {
  try {
    const config = loadPrompts();
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    const searchProvider = process.env.SEARCH_PROVIDER || "serpapi";
    const searchKeyConfigured = !!(
      (searchProvider === "serpapi" && process.env.SERPAPI_API_KEY) ||
      (searchProvider === "bing" && process.env.BING_SEARCH_API_KEY)
    );

    return NextResponse.json({
      config,
      apiKeyStatus: hasApiKey ? "configured" : "not configured",
      searchProvider,
      searchKeyStatus: searchKeyConfigured ? "configured" : "not configured",
    });
  } catch (error) {
    console.error("Failed to load prompts:", error);
    return NextResponse.json(
      { error: "Failed to load prompts" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = body.config as PromptsConfig;

    if (!config || !config.questions || !config.settings) {
      return NextResponse.json(
        { error: "Invalid config structure" },
        { status: 400 },
      );
    }

    // Ensure photo section exists with all required fields
    if (!config.photo) {
      config.photo = {
        systemPrompt: "Ты — Кизер, дружелюбный и эрудированный ИИ-экскурсовод. Расскажи об объектах на фотографии интересно и увлекательно.",
        identifyPrompt: "",
        resolvePrompt: "",
        tourPrompt: "",
        followupPrompt: "",
      };
    } else {
      if (!config.photo.identifyPrompt) config.photo.identifyPrompt = "";
      const photo = config.photo as { resolvePrompt?: string };
      if (typeof photo.resolvePrompt !== "string") photo.resolvePrompt = "";
      if (!config.photo.tourPrompt) config.photo.tourPrompt = "";
      if (!config.photo.followupPrompt) config.photo.followupPrompt = "";
    }

    savePrompts(config);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save prompts:", error);
    return NextResponse.json(
      { error: "Failed to save prompts" },
      { status: 500 },
    );
  }
}

