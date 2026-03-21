import { NextRequest, NextResponse } from "next/server";
import { openai } from "../../../../lib/openai/client";
import { loadPrompts } from "../../../../lib/config/prompts";

type TourResult = {
  title: string;
  tourText: string;
  quickFacts: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageDataUrl, objectName, objectType, placeHint, settings, messages, resolveResult, identify, resolve } = body;

    let effectiveName: string;
    let effectiveType: string;
    let locationHint: string | undefined;
    let sources: string[];
    let resolved = resolveResult;

    if (resolve && typeof resolve === "object") {
      effectiveName = resolve.objectName ?? identify?.primarySubject ?? objectName;
      effectiveType = resolve.objectType ?? identify?.objectType ?? objectType;
      locationHint = resolve.locationHint ?? placeHint;
      sources = Array.isArray(resolve.sources) ? resolve.sources : [];
      resolved = resolve;
    } else if (identify && typeof identify === "object" && !resolved) {
      effectiveName = identify.primarySubject ?? objectName;
      effectiveType = identify.objectType ?? objectType;
      locationHint = placeHint;
      sources = [];
      resolved = { objectName: effectiveName, objectType: effectiveType, confidence: identify.confidence, sources: [] };
    } else {
      effectiveName = resolved?.objectName ?? objectName;
      effectiveType = resolved?.objectType ?? objectType;
      locationHint = resolved?.locationHint ?? placeHint;
      sources = Array.isArray(resolved?.sources) ? resolved.sources : [];
    }

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
        { status: 400 },
      );
    }

    if (!effectiveName || !effectiveType) {
      return NextResponse.json(
        { error: "objectName and objectType are required" },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const config = loadPrompts();
    const tourPrompt = config.photo.tourPrompt || 
      "Создай интересную экскурсию об объекте. Верни JSON: {title, tourText, quickFacts}";

    let prompt = tourPrompt
      .replace(/\{objectName\}/g, effectiveName)
      .replace(/\{objectType\}/g, effectiveType);
    if (sources.length > 0) {
      prompt += `\n\nИсточники для экскурсии (используй при рассказе, не выдумывай):\n${sources.map((u: string, i: number) => `${i + 1}. ${u}`).join("\n")}`;
    }
    if (resolved?.confidence === "low") {
      prompt += "\n\nТочное совпадение не подтверждено источниками. Расскажи в формате гипотезы: «по признакам похоже на…», не утверждай как факт.";
    }

    // Добавляем настройки тона и аудитории
    const tone = settings?.tone || config.settings.defaultTone;
    const audience = settings?.audience || config.settings.defaultAudience;

    let toneInstruction = "";
    if (tone === "scientific") {
      toneInstruction = "Больше фактов и терминов, но понятно.";
    } else if (tone === "entertainment") {
      toneInstruction = "Больше историй и интересных деталей.";
    }

    if (audience === "child") {
      toneInstruction += " Простые слова, мягкая подача.";
    }

    if (toneInstruction) {
      prompt += `\n\nТональность: ${toneInstruction}`;
    }

    // Если есть история сообщений (для follow-up вопросов), используем followupPrompt
    const isFollowup = messages && Array.isArray(messages) && messages.length > 0;
    const followupPrompt = config.photo.followupPrompt || tourPrompt;

    if (isFollowup) {
      // Для follow-up вопросов возвращаем просто текст, а не JSON структуру
      const lastUserMessage = messages[messages.length - 1];
      if (lastUserMessage?.role === "user") {
        const followupSystemPrompt = followupPrompt
          .replace(/\{objectName\}/g, effectiveName)
          .replace(/\{objectType\}/g, effectiveType);

        // Формируем контекст из истории
        const historyContext = messages
          .slice(-4) // Последние 4 сообщения (2 пары вопрос-ответ)
          .map((m: any) => `${m.role === "user" ? "Пользователь" : "Кизер"}: ${m.content}`)
          .join("\n");

        const response = await openai.responses.create({
          model: "gpt-5.2",
          input: [
            {
              role: "system",
              content: followupSystemPrompt,
            },
            {
              role: "user",
              content: `Объект: ${effectiveName} (${effectiveType}).\n\nКонтекст предыдущего диалога:\n${historyContext}\n\nТекущий вопрос пользователя: ${lastUserMessage.content}`,
            },
          ],
          tools: [{ type: "web_search" }],
          temperature: 0.7,
          max_output_tokens: 800,
        } as any);

        const content = response.output_text;
        if (!content) {
          throw new Error("Empty response from OpenAI");
        }

        // Для follow-up возвращаем просто текст
        return NextResponse.json({
          title: effectiveName,
          tourText: content,
          quickFacts: [],
        });
      }
    }

    // Для первоначальной экскурсии используем tourPrompt и ожидаем JSON
    // Используем Responses API для экскурсии
    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: `Объект: ${effectiveName} (${effectiveType}). ${locationHint ? `Место: ${locationHint}. ` : ""}Создай экскурсию.`,
        },
      ],
      tools: [{ type: "web_search" }],
      temperature: 0.7,
      max_output_tokens: 1500,
    } as any);

    const content = response.output_text;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Пытаемся распарсить JSON из ответа
    let result: TourResult;
    try {
      // Ищем JSON в ответе
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]) as TourResult;
      } else {
        // Если JSON не найден, создаём структуру из текста
        const lines = content.split("\n").filter(l => l.trim());
        result = {
          title: lines[0] || effectiveName,
          tourText: content,
          quickFacts: lines.slice(1, 6).filter(l => l.length > 10),
        };
      }
    } catch (parseError) {
      // Если не удалось распарсить, используем весь текст как tourText
      result = {
        title: effectiveName,
        tourText: content,
        quickFacts: [],
      };
    }

    // Валидация
    if (!result.title || !result.tourText) {
      return NextResponse.json(
        { error: "Invalid response format from OpenAI" },
        { status: 500 },
      );
    }

    if (!Array.isArray(result.quickFacts)) {
      result.quickFacts = [];
    }

    const responsePayload: Record<string, unknown> = { ...result };
    if (sources.length > 0) {
      responsePayload.sources = sources;
    }
    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Tour API error:", error);

    const errorMessage = error?.message || "Failed to generate tour";
    const status = errorMessage.includes("API ключ") ? 401 :
                   errorMessage.includes("лимит") ? 429 : 500;

    return NextResponse.json(
      { error: errorMessage },
      { status },
    );
  }
}
