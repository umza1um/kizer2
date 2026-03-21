import { NextRequest, NextResponse } from "next/server";
import { openai } from "../../../../lib/openai/client";
import { loadPrompts } from "../../../../lib/config/prompts";

const OBJECT_TYPES = ["painting", "sculpture", "art_object", "architecture", "museum_exhibit", "historical_landmark", "religious_building", "urban_space", "nature", "other"] as const;

export type IdentifyFeatures = {
  objectType: (typeof OBJECT_TYPES)[number];
  primarySubject: string;
  visualKeywords: string[];
  stylePeriodHint: string | null;
  textOnObject: string | null;
  locationClues: string | null;
  confidence: "high" | "medium" | "low";
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageDataUrl, objectHint, settings } = body;

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
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
    const identifyPrompt = config.photo.identifyPrompt ||
      "Извлеки признаки с фото и верни JSON: {objectType, primarySubject, visualKeywords, stylePeriodHint, textOnObject, locationClues, confidence}";

    // Используем Vision API для определения объекта
    const userPrompt = objectHint
      ? `Подсказка: ${objectHint}. Извлеки визуальные признаки и верни JSON.`
      : "Извлеки визуальные признаки с фото и верни JSON.";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: identifyPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt,
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    let result: IdentifyFeatures;
    try {
      result = JSON.parse(content) as IdentifyFeatures;
    } catch (parseError) {
      console.warn("Failed to parse JSON:", content);
      result = {
        objectType: "other",
        primarySubject: "Не удалось определить",
        visualKeywords: [],
        stylePeriodHint: null,
        textOnObject: null,
        locationClues: null,
        confidence: "low",
      };
    }

    if (!result.primarySubject || !result.objectType || !result.confidence) {
      return NextResponse.json(
        { error: "Invalid response format from OpenAI" },
        { status: 500 },
      );
    }
    if (!Array.isArray(result.visualKeywords)) result.visualKeywords = [];

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Identify API error:", error);

    const errorMessage = error?.message || "Failed to identify object";
    const status = errorMessage.includes("API ключ") ? 401 :
                   errorMessage.includes("лимит") ? 429 : 500;

    return NextResponse.json(
      { error: errorMessage },
      { status },
    );
  }
}
