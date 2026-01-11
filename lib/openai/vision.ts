import { openai } from "./client";

export async function chatCompletionWithVision(
  imageDataUrl: string,
  message: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  try {
    // Формируем историю диалога как текстовые сообщения
    const historyMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    
    // Добавляем последние 4 сообщения из истории (2 пары вопрос-ответ)
    const recentHistory = messages.slice(-4);
    for (const msg of recentHistory) {
      historyMessages.push({
        role: msg.role,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      });
    }

    // Текущее сообщение с изображением
    const currentUserMessage = {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: message,
        },
        {
          type: "image_url" as const,
          image_url: {
            url: imageDataUrl,
          },
        },
      ],
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        currentUserMessage,
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    return content;
  } catch (error) {
    console.error("OpenAI Vision API error:", error);
    throw new Error("Failed to get response from AI");
  }
}



