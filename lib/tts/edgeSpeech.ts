import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Readable } from "stream";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Free Microsoft Neural TTS via Edge Read Aloud (no Azure subscription key). */
export async function synthesizeWithEdgeSpeech(
  text: string,
  voice: string,
  speed?: number
): Promise<ArrayBuffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const rate =
      speed !== undefined && speed > 0
        ? speed <= 1.5
          ? speed
          : Math.min(2, speed)
        : 0.92;
    const { audioStream } = tts.toStream(text, { rate });
    const buffer = await streamToBuffer(audioStream);
    const out = new Uint8Array(buffer.byteLength);
    out.set(buffer);
    return out.buffer;
  } finally {
    tts.close();
  }
}
