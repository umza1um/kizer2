import { NextResponse } from "next/server";
import { openai } from "../../../../lib/openai/client";

export async function GET() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        success: false,
        error: "OPENAI_API_KEY не настроен",
      });
    }

    // Делаем минимальный тестовый запрос к OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 5,
    });

    if (response.choices && response.choices.length > 0) {
      return NextResponse.json({
        success: true,
        message: "API ключ работает корректно",
      });
    }

    return NextResponse.json({
      success: false,
      error: "Неожиданный ответ от API",
    });
  } catch (error: any) {
    console.error("API key check error:", error);

    if (error?.status === 401 || error?.message?.includes("401")) {
      return NextResponse.json({
        success: false,
        error: "Неверный API ключ (401 Unauthorized)",
      });
    }

    if (error?.status === 429) {
      return NextResponse.json({
        success: false,
        error: "Превышен лимит запросов (429 Rate Limit)",
      });
    }

    return NextResponse.json({
      success: false,
      error: error?.message || "Ошибка при проверке ключа",
    });
  }
}



