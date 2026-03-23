import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

const VALID_VOICES = new Set([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

const MAX_CHARS = 4096;

/**
 * Проверка доступности облачного TTS (ключ на сервере).
 */
export async function GET() {
  const enabled = Boolean(process.env.OPENAI_API_KEY?.trim());
  return NextResponse.json({
    enabled,
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
  });
}

/**
 * Синтез речи (MP3) через OpenAI TTS. Ключ не уходит на клиент.
 */
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "TTS не настроен (нет OPENAI_API_KEY)" },
      { status: 503 }
    );
  }

  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Пустой текст" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Текст длиннее ${MAX_CHARS} символов` },
      { status: 400 }
    );
  }

  const voice =
    typeof body.voice === "string" && VALID_VOICES.has(body.voice)
      ? body.voice
      : "nova";

  try {
    const response = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text,
    });

    const buf = Buffer.from(await response.arrayBuffer());
    return new Response(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("OpenAI TTS error:", e);
    return NextResponse.json(
      { error: "Ошибка синтеза речи" },
      { status: 502 }
    );
  }
}
