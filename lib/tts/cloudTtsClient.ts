import type { AzureTtsVoice, OpenAiTtsVoice, TtsProvider } from "./settings";

export type CloudTtsRequest = {
  provider: Exclude<TtsProvider, "browser">;
  voice: string;
  text: string;
  speed: number;
  openAiVoice?: OpenAiTtsVoice;
  azureVoice?: AzureTtsVoice;
  format?: "mp3";
  signal?: AbortSignal;
};

const memoryCache = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob>>();
const MAX_CACHE_ENTRIES = 48;

function cacheKey(req: CloudTtsRequest): string {
  return `${req.provider}|${req.voice}|${req.speed}|${req.text}`;
}

function trimCache(): void {
  while (memoryCache.size > MAX_CACHE_ENTRIES) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
    else break;
  }
}

async function fetchCloudTtsBlobUncached(req: CloudTtsRequest): Promise<Blob> {
  const res = await fetch("/api/tts/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: req.provider,
      text: req.text,
      voice: req.voice,
      model: "gpt-4o-mini-tts",
      format: req.format ?? "mp3",
      speed: req.speed,
    }),
    signal: req.signal,
  });

  if (!res.ok) {
    let errorText = "Не удалось получить озвучку";
    try {
      const payload: unknown = await res.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
      ) {
        errorText = (payload as { error: string }).error;
      }
    } catch {
      // ignore
    }
    throw new Error(errorText);
  }

  const blob = await res.blob();
  if (blob.size < 64) {
    throw new Error("Пустой аудиофайл от сервера");
  }

  return blob;
}

export async function fetchCloudTtsBlob(req: CloudTtsRequest): Promise<Blob> {
  const key = cacheKey(req);
  const hit = memoryCache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) {
    const blob = await pending;
    if (req.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return blob;
  }

  const task = fetchCloudTtsBlobUncached(req)
    .then((blob) => {
      memoryCache.set(key, blob);
      trimCache();
      return blob;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

/** Загрузка в кэш без воспроизведения. */
export function prefetchCloudTts(req: CloudTtsRequest): void {
  const key = cacheKey(req);
  if (memoryCache.has(key) || inflight.has(key)) return;
  void fetchCloudTtsBlob(req).catch(() => {
    // не трогаем cache — иначе ломаем успешные загрузки
  });
}

export function clearCloudTtsCache(): void {
  memoryCache.clear();
  inflight.clear();
}
