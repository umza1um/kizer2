import { describe, expect, it } from "vitest";
import {
  appendDesktopTranscript,
  buildDesktopTranscriptFull,
  buildMobileTranscript,
  buildTranscriptFromEvent,
  mergeTranscriptOnRestart,
} from "./transcript";

type ResultEntry = { transcript: string; isFinal: boolean; confidence?: number };

function mockResults(entries: ResultEntry[]): SpeechRecognitionResultList {
  const items: SpeechRecognitionResult[] = entries.map((entry) => {
    const alt: SpeechRecognitionAlternative = {
      transcript: entry.transcript,
      confidence: entry.confidence ?? 0.95,
    };
    const result: SpeechRecognitionResult = {
      length: 1,
      isFinal: entry.isFinal,
      0: alt,
      item(index: number) {
        return index === 0 ? alt : (undefined as unknown as SpeechRecognitionAlternative);
      },
    };
    return result;
  });

  const list: SpeechRecognitionResultList = {
    length: items.length,
    item(index: number) {
      return items[index];
    },
  };

  for (let i = 0; i < items.length; i += 1) {
    (list as SpeechRecognitionResultList & Record<number, SpeechRecognitionResult>)[i] = items[i];
  }

  return list;
}

describe("buildMobileTranscript", () => {
  it("берёт последний кумулятивный final, не склеивает дубли (Android)", () => {
    const results = mockResults([
      { transcript: "Расскажи", isFinal: true },
      { transcript: "Расскажи про", isFinal: true },
      { transcript: "Расскажи про виллу алоизе в сухуми", isFinal: true },
    ]);

    expect(buildMobileTranscript(results)).toBe("Расскажи про виллу алоизе в сухуми");
  });

  it("предпочитает более длинный interim", () => {
    const results = mockResults([
      { transcript: "привет", isFinal: true },
      { transcript: "привет мир", isFinal: false },
    ]);

    expect(buildMobileTranscript(results)).toBe("привет мир");
  });

  it("возвращает пустую строку без результатов", () => {
    expect(buildMobileTranscript(mockResults([]))).toBe("");
  });
});

describe("buildDesktopTranscriptFull", () => {
  it("склеивает отдельные final-сегменты", () => {
    const results = mockResults([
      { transcript: "Привет", isFinal: true },
      { transcript: " ", isFinal: true },
      { transcript: "мир", isFinal: true },
    ]);

    expect(buildDesktopTranscriptFull(results)).toBe("Привет мир");
  });

  it("добавляет последний interim к final", () => {
    const results = mockResults([
      { transcript: "Где находится", isFinal: true },
      { transcript: "Где находится Эрмитаж", isFinal: false },
    ]);

    expect(buildDesktopTranscriptFull(results)).toBe("Где находится Эрмитаж");
  });
});

describe("appendDesktopTranscript", () => {
  it("дополняет только новые результаты с resultIndex", () => {
    const results = mockResults([
      { transcript: "Привет", isFinal: true },
      { transcript: " мир", isFinal: true },
    ]);

    expect(appendDesktopTranscript("", results, 0)).toBe("Привет мир");
    expect(appendDesktopTranscript("Привет", results, 1)).toBe("Привет мир");
  });
});

describe("buildTranscriptFromEvent", () => {
  it("использует mobile-стратегию по опции", () => {
    const results = mockResults([
      { transcript: "тест", isFinal: true },
      { transcript: "тест один два", isFinal: true },
    ]);

    expect(buildTranscriptFromEvent(results, 0, { strategy: "mobile" })).toBe("тест один два");
  });

  it("использует desktop-стратегию по опции", () => {
    const results = mockResults([
      { transcript: "раз", isFinal: true },
      { transcript: " два", isFinal: true },
    ]);

    expect(buildTranscriptFromEvent(results, 0, { strategy: "desktop" })).toBe("раз два");
  });
});

describe("mergeTranscriptOnRestart", () => {
  it("берёт более длинную кумулятивную строку", () => {
    expect(
      mergeTranscriptOnRestart("Расскажи про", "Расскажи про виллу"),
    ).toBe("Расскажи про виллу");
  });

  it("склеивает разные фразы через пробел", () => {
    expect(mergeTranscriptOnRestart("первая фраза", "вторая фраза")).toBe(
      "первая фраза вторая фраза",
    );
  });

  it("не дублирует идентичный текст", () => {
    expect(mergeTranscriptOnRestart("тот же текст", "тот же текст")).toBe("тот же текст");
  });
});
