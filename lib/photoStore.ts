/**
 * In-memory temporary image store for Reverse Image Search (SerpApi Lens).
 * Images are removed after TTL (15 min) or on next put (cleanup).
 * RU: Временное хранилище изображений для Google Lens. EN: Temporary image store for Google Lens.
 */

const TTL_MS = 15 * 60 * 1000; // 15 min

type Entry = {
  buffer: Buffer;
  mime: string;
  expires: number;
};

const store = new Map<string, Entry>();

function cleanup(): void {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expires <= now) store.delete(id);
  }
}

export function putImage(buffer: Buffer, mime: string): string {
  cleanup();
  const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  store.set(id, {
    buffer,
    mime,
    expires: Date.now() + TTL_MS,
  });
  return id;
}

export function getImage(id: string): { buffer: Buffer; mime: string } | null {
  const entry = store.get(id);
  if (!entry || entry.expires <= Date.now()) {
    if (entry) store.delete(id);
    return null;
  }
  return { buffer: entry.buffer, mime: entry.mime };
}

export function makePublicImageUrl(id: string): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/api/photo/image/${id}`;
}
