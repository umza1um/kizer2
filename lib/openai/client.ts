import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set in environment variables");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

type WebSource = {
  title: string;
  url: string;
};

function extractWebSources(response: any): WebSource[] {
  const sources: WebSource[] = [];
  const output = response?.output || [];

  for (const item of output) {
    if (!item || !Array.isArray(item.content)) continue;

    for (const content of item.content) {
      const annotations = content?.annotations || [];
      if (!Array.isArray(annotations)) continue;

      for (const annotation of annotations) {
        if (!annotation) continue;

        if (annotation.type === "url_citation" && annotation.url) {
          sources.push({
            title: annotation.title || annotation.url,
            url: annotation.url,
          });
        }

        if (annotation.type === "web_search_result" && annotation.url) {
          sources.push({
            title: annotation.title || annotation.url,
            url: annotation.url,
          });
        }
      }
    }
  }

  const unique = new Map<string, WebSource>();
  for (const source of sources) {
    unique.set(source.url, source);
  }

  return Array.from(unique.values());
}

export async function chatCompletion(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    tools: [{ type: "web_search" }],
    temperature: 0.3,
    max_output_tokens: 1000,
  } as any);

  const content = response.output_text;
  if (!content) throw new Error("Empty response from OpenAI");

  const sources = extractWebSources(response);
  if (sources.length === 0) {
    console.warn("Web search is unavailable or returned no sources");
    return `${content.trim()}\n\nВеб-поиск недоступен.\n\nИсточники: веб-поиск недоступен.`;
  }

  if (sources.length < 3) {
    console.warn("Web search returned fewer than 3 sources");
  }

  const limitedSources = sources.slice(0, 8);
  const sourcesBlock = limitedSources
    .map((source, index) => `${index + 1}. ${source.title} — ${source.url}`)
    .join("\n");

  return `${content.trim()}\n\nИсточники:\n${sourcesBlock}`;
}
