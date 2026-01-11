import { NextRequest, NextResponse } from "next/server";
import { loadPrompts, savePrompts, type PromptsConfig } from "../../../../lib/config/prompts";

export async function GET() {
  try {
    const config = loadPrompts();
    const hasApiKey = !!process.env.OPENAI_API_KEY;

    return NextResponse.json({
      config,
      apiKeyStatus: hasApiKey ? "configured" : "not configured",
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

    // Ensure photo section exists
    if (!config.photo) {
      config.photo = {
        systemPrompt: "Ты — Кизер, дружелюбный и эрудированный ИИ-экскурсовод. Расскажи об объектах на фотографии интересно и увлекательно.",
      };
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

