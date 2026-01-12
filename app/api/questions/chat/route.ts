import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "../../../../lib/openai/client";
import { loadPrompts } from "../../../../lib/config/prompts";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, messages, settings } = body;

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
    const systemPrompt = config.questions.systemPrompt;

    const userPrompt = config.questions.userPromptTemplate.replace(
      "{message}",
      message,
    );

    const chatMessages = [
      ...messages,
      { role: "user" as const, content: userPrompt },
    ];

    const assistantText = await chatCompletion(chatMessages, systemPrompt);

    return NextResponse.json({ assistantText });
  } catch (error: any) {
    console.error("Chat API error:", error);
    
    const errorMessage = error?.message || "Failed to process chat request";
    const status = errorMessage.includes("API ключ") ? 401 : 
                   errorMessage.includes("лимит") ? 429 : 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status },
    );
  }
}



