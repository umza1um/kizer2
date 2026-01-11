import { NextRequest, NextResponse } from "next/server";
import { chatCompletionWithVision } from "../../../../lib/openai/vision";
import { loadPrompts } from "../../../../lib/config/prompts";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageDataUrl, message, messages, settings } = body;

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
        { status: 400 },
      );
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 },
      );
    }

    const config = loadPrompts();
    const systemPrompt = config.photo?.systemPrompt || 
      "Ты — Кизер, дружелюбный и эрудированный ИИ-экскурсовод. Расскажи об объектах на фотографии интересно и увлекательно.";

    const assistantText = await chatCompletionWithVision(
      imageDataUrl,
      message,
      messages,
      systemPrompt,
    );

    return NextResponse.json({ assistantText });
  } catch (error) {
    console.error("Photo chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process photo chat request" },
      { status: 500 },
    );
  }
}



