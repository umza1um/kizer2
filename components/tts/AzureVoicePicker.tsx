"use client";

import { AZURE_TTS_VOICES, type AzureTtsVoice } from "../../lib/tts/settings";

type Props = {
  value: AzureTtsVoice;
  onChange: (voice: AzureTtsVoice) => void;
  disabled?: boolean;
};

export function AzureVoicePicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Голос озвучки">
      {AZURE_TTS_VOICES.map((v) => {
        const selected = value === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(v.id)}
            className={[
              "w-full rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition active:scale-[0.98]",
              selected
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-900 hover:border-slate-400",
              disabled ? "opacity-50 pointer-events-none" : "",
            ].join(" ")}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
