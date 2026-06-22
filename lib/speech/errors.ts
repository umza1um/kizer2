const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  network:
    "Нет связи с сервисом распознавания. Проверьте интернет или откройте сайт по HTTPS.",
  "not-allowed": "Разрешите доступ к микрофону в настройках браузера.",
  "audio-capture": "Микрофон занят или недоступен.",
  "service-not-allowed": "Распознавание речи недоступно в этом браузере.",
};

/** Ошибки, при которых можно перезапустить recognition, если кнопка ещё зажата. */
export function isRecoverableSpeechError(error: string): boolean {
  return error === "network" || error === "audio-capture";
}

export function speechErrorMessage(error: string): string {
  return SPEECH_ERROR_MESSAGES[error] ?? `Ошибка распознавания: ${error}`;
}

/** Задержка перед restart() после onend — Chrome кидает InvalidStateError без паузы. */
export const SPEECH_RESTART_DELAY_MS = 300;
