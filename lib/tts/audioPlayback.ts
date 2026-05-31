/** Minimal valid MP3 — unlocks autoplay when played on user click. */
const SILENT_MP3_DATA_URL =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAQAAAAAAAAAAYRUqD5VAAAAAAAAAAAAAAAAAAAAAP/7UMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

let audioUnlocked = false;
let sharedAudio: HTMLAudioElement | null = null;
let sharedObjectUrl: string | null = null;

function revokeSharedObjectUrl(): void {
  if (sharedObjectUrl) {
    URL.revokeObjectURL(sharedObjectUrl);
    sharedObjectUrl = null;
  }
}

/** One hidden <audio> in document — works more reliably than new Audio() per play. */
export function getSharedAudioElement(): HTMLAudioElement {
  if (typeof document === "undefined") {
    throw new Error("Audio is only available in the browser");
  }

  if (!sharedAudio) {
    const el = document.createElement("audio");
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.preload = "auto";
    el.volume = 1;
    el.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    sharedAudio = el;
  }

  return sharedAudio;
}

/** Call synchronously inside a click/tap handler before any await. */
export function unlockAudioPlayback(): void {
  if (typeof window === "undefined") return;

  const audio = getSharedAudioElement();
  audio.muted = true;
  audio.src = SILENT_MP3_DATA_URL;

  const playAttempt = audio.play();
  if (!playAttempt) return;

  void playAttempt
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.removeAttribute("src");
      audioUnlocked = true;
    })
    .catch(() => {
      audio.muted = false;
    });
}

export function pauseSharedAudio(): void {
  if (!sharedAudio) return;
  sharedAudio.pause();
  sharedAudio.currentTime = 0;
  revokeSharedObjectUrl();
  sharedAudio.removeAttribute("src");
}

export function isPlaybackError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "NotSupportedError";
  }
  if (error instanceof Error) {
    return /воспроизв|заблокировал|пустой аудио|загрузить звук|таймаут загрузки/i.test(
      error.message,
    );
  }
  return false;
}

export function waitForAudioReady(audio: HTMLAudioElement, timeoutMs = 8_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const tryResolve = () => {
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        cleanup();
        resolve();
      }
    };

    const timer = window.setTimeout(() => {
      cleanup();
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }
      reject(new Error("Таймаут загрузки звука"));
    }, timeoutMs);

    const onError = () => {
      cleanup();
      const code = audio.error?.code;
      const msg =
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "Формат звука не поддерживается браузером"
          : "Не удалось загрузить звук";
      reject(new Error(msg));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      audio.removeEventListener("loadeddata", tryResolve);
      audio.removeEventListener("canplay", tryResolve);
      audio.removeEventListener("canplaythrough", tryResolve);
      audio.removeEventListener("error", onError);
    };

    audio.addEventListener("loadeddata", tryResolve, { once: true });
    audio.addEventListener("canplay", tryResolve, { once: true });
    audio.addEventListener("canplaythrough", tryResolve, { once: true });
    audio.addEventListener("error", onError, { once: true });

    tryResolve();
    audio.load();
  });
}

export async function playMp3Blob(blob: Blob): Promise<HTMLAudioElement> {
  if (!blob.size) {
    throw new Error("Пустой аудиофайл от сервера");
  }

  const audio = getSharedAudioElement();
  audio.pause();
  revokeSharedObjectUrl();

  const buffer = await blob.arrayBuffer();
  const typed = new Blob([buffer], {
    type: blob.type && blob.type !== "application/octet-stream" ? blob.type : "audio/mpeg",
  });

  sharedObjectUrl = URL.createObjectURL(typed);
  audio.muted = false;
  audio.volume = 1;
  audio.src = sharedObjectUrl;

  await waitForAudioReady(audio);

  try {
    await audio.play();
  } catch (e) {
    revokeSharedObjectUrl();
    audio.removeAttribute("src");
    if (e instanceof DOMException && e.name === "NotAllowedError") {
      throw new Error(
        "Браузер заблокировал воспроизведение. Нажмите кнопку озвучки ещё раз.",
      );
    }
    throw e;
  }

  return audio;
}

export function revokeSharedObjectUrlOnEnd(): void {
  revokeSharedObjectUrl();
}
