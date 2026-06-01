import { splitIntoSpeakSegments } from "./browserSpeech";

const DEFAULT_MAX_CHARS = 200;

/** Короткие фразы — один запрос; длинный ответ — по предложениям (быстрее старт). */
export function chunkTextForTts(text: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const segments = splitIntoSpeakSegments(trimmed);
  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    if (buf) {
      chunks.push(buf);
      buf = "";
    }
  };

  for (const seg of segments) {
    if (!seg) continue;
    if (seg.length > maxChars) {
      flush();
      for (let i = 0; i < seg.length; i += maxChars) {
        chunks.push(seg.slice(i, i + maxChars).trim());
      }
      continue;
    }
    const next = buf ? `${buf} ${seg}` : seg;
    if (next.length <= maxChars) {
      buf = next;
    } else {
      flush();
      buf = seg;
    }
  }
  flush();

  return chunks.length ? chunks : [trimmed];
}

export function shouldUseChunkedTts(text: string): boolean {
  return text.trim().length > 160;
}
