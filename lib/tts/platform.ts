/** iPhone, iPad, iPod (incl. iPadOS desktop UA). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIOS() || /Android/i.test(navigator.userAgent);
}

/** On phones, browser TTS is robotic — use server Neural voices only. */
export function shouldUseCloudTtsOnly(): boolean {
  return isMobileDevice();
}
