/** True when a real Azure Speech API key is configured (not a placeholder). */
export function isAzureSpeechKeyConfigured(): boolean {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  if (!key) return false;
  const placeholders = [
    "your_azure_speech_key_here",
    "paste_your_key_here",
    "changeme",
  ];
  if (placeholders.includes(key.toLowerCase())) return false;
  if (/^your[_-]?azure/i.test(key)) return false;
  return key.length >= 16;
}

export function isAzureSpeechRegionConfigured(): boolean {
  return Boolean(process.env.AZURE_SPEECH_REGION?.trim());
}
