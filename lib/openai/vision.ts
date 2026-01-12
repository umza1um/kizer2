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
    // Если message пустой, используем пустую строку - системный промпт из админки сделает всю работу
    const messageText = message.trim() || "";
    
    const currentUserMessage = {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: messageText,
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
  } catch (error: any) {
    console.error("OpenAI Vision API error:", error);
    
    if (error?.status === 401 || error?.code === "invalid_api_key") {
      throw new Error("Неверный API ключ. Проверьте настройки в .env.local");
    }
    
    if (error?.status === 429) {
      throw new Error("Превышен лимит запросов. Попробуйте позже");
    }
    
    const errorMessage = error?.message || "Неизвестная ошибка";
    throw new Error(`Ошибка API: ${errorMessage}`);
  }
}



