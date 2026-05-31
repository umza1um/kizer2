import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "../../../../lib/openai/client";
import {
  isAzureSpeechKeyConfigured,
  isAzureSpeechRegionConfigured,
} from "../../../../lib/tts/azureConfig";
import { synthesizeWithEdgeSpeech } from "../../../../lib/tts/edgeSpeech";

export const runtime = "nodejs";

const ttsRequestSchema = z.object({
  provider: z.enum(["openai", "azure"]).default("openai"),
  text: z.string().trim().min(1, "text is required").max(5000, "text is too long"),
  voice: z.string().trim().min(1, "voice is required"),
  model: z.enum(["gpt-4o-mini-tts", "tts-1", "tts-1-hd"]).default("gpt-4o-mini-tts"),
  format: z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]).default("mp3"),
  speed: z.number().min(0.25).max(4).optional(),
});

type TtsRequest = z.infer<typeof ttsRequestSchema>;
type AudioFormat = TtsRequest["format"];

const contentTypeByFormat: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/pcm",
};

function mapTtsErrorToStatus(message: string): number {
  if (
    message.includes("OPENAI_API_KEY") ||
    message.includes("AZURE_SPEECH_KEY") ||
    message.includes("AZURE_SPEECH_REGION")
  ) {
    return 401;
  }
  if (message.includes("401")) return 401;
  if (message.includes("429") || message.toLowerCase().includes("rate")) return 429;
  return 500;
}

const OPENAI_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
]);

const AZURE_VOICES = new Set([
  "ru-RU-SvetlanaNeural",
  "ru-RU-DmitryNeural",
  "ru-RU-DariyaNeural",
]);

const azureOutputFormatByFormat: Record<AudioFormat, string> = {
  mp3: "audio-24khz-96kbitrate-mono-mp3",
  opus: "ogg-24khz-16bit-mono-opus",
  aac: "audio-24khz-96kbitrate-mono-mp3",
  flac: "raw-24khz-16bit-mono-pcm",
  wav: "riff-24khz-16bit-mono-pcm",
  pcm: "raw-24khz-16bit-mono-pcm",
};

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function assertVoiceForProvider(payload: TtsRequest): string | null {
  if (payload.provider === "openai" && !OPENAI_VOICES.has(payload.voice)) {
    return "Unsupported OpenAI voice";
  }
  if (payload.provider === "azure" && !AZURE_VOICES.has(payload.voice)) {
    return "Unsupported Azure voice";
  }
  return null;
}

async function synthesizeWithOpenAi(payload: TtsRequest): Promise<ArrayBuffer> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const response = await openai.audio.speech.create({
    model: payload.model,
    voice: payload.voice as
      | "alloy"
      | "ash"
      | "ballad"
      | "coral"
      | "echo"
      | "fable"
      | "nova"
      | "onyx"
      | "sage"
      | "shimmer",
    input: payload.text,
    response_format: payload.format,
    speed: payload.speed,
  });

  return response.arrayBuffer();
}

async function synthesizeWithAzureApi(payload: TtsRequest): Promise<ArrayBuffer> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key) throw new Error("AZURE_SPEECH_KEY is not configured");
  if (!region) throw new Error("AZURE_SPEECH_REGION is not configured");

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = `<speak version="1.0" xml:lang="ru-RU"><voice name="${payload.voice}">${escapeXml(payload.text)}</voice></speak>`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": azureOutputFormatByFormat[payload.format],
      "User-Agent": "kizer2-tts",
    },
    body: ssml,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Azure TTS failed with ${response.status}${details ? `: ${details}` : ""}`);
  }

  return response.arrayBuffer();
}

/** Azure API when key is set; otherwise free Edge TTS (same Neural voice names). */
async function synthesizeWithAzure(payload: TtsRequest): Promise<ArrayBuffer> {
  if (isAzureSpeechKeyConfigured() && isAzureSpeechRegionConfigured()) {
    try {
      return await synthesizeWithAzureApi(payload);
    } catch (error) {
      console.warn("Azure Speech API failed, using Edge TTS fallback:", error);
    }
  }

  if (payload.format !== "mp3") {
    throw new Error("Without Azure API key only mp3 format is supported (Edge TTS)");
  }

  return synthesizeWithEdgeSpeech(payload.text, payload.voice, payload.speed);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ttsRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const invalidVoice = assertVoiceForProvider(payload);
    if (invalidVoice) {
      return NextResponse.json({ error: invalidVoice }, { status: 400 });
    }

    const bytes =
      payload.provider === "azure"
        ? await synthesizeWithAzure(payload)
        : await synthesizeWithOpenAi(payload);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentTypeByFormat[payload.format],
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to synthesize speech";
    console.error("TTS speak API error:", error);
    return NextResponse.json(
      { error: message },
      { status: mapTtsErrorToStatus(message) },
    );
  }
}

