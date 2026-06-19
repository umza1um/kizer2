"use client";

type QuestionInputBarProps = {
  sendDisabled: boolean;
  micDisabled: boolean;
  micListening: boolean;
  onSend: (text: string) => void;
  onMicPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

export function QuestionInputBar({
  sendDisabled,
  micDisabled,
  micListening,
  onSend,
  onMicPointerDown,
  onMicPointerUp,
}: QuestionInputBarProps) {
  return (
    <form
      className="mb-3 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("question") as HTMLInputElement | null;
        const text = input?.value.trim() ?? "";
        if (!text || sendDisabled) return;
        if (input) input.value = "";
        onSend(text);
      }}
    >
      <input
        name="question"
        type="text"
        enterKeyHint="send"
        autoComplete="off"
        placeholder="Или введите вопрос…"
        disabled={sendDisabled}
        className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={sendDisabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-medium text-white disabled:opacity-50"
        aria-label="Отправить вопрос"
      >
        →
      </button>
      <button
        type="button"
        onPointerDown={onMicPointerDown}
        onPointerUp={onMicPointerUp}
        onPointerCancel={onMicPointerUp}
        disabled={micDisabled}
        className={`flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full text-lg shadow-md touch-none ${
          micListening ? "bg-blue-600 text-white" : "bg-slate-900 text-white"
        } ${micDisabled ? "cursor-not-allowed opacity-50" : ""}`}
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", touchAction: "none" }}
        aria-label={
          micListening
            ? "Слушаю… отпустите, когда закончите вопрос"
            : "Удерживайте и говорите"
        }
      >
        🎤
      </button>
    </form>
  );
}
