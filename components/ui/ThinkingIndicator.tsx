type ThinkingIndicatorProps = {
  message?: string;
  className?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ThinkingIndicator({
  message = "собираюсь с мыслями",
  className,
}: ThinkingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3",
        className,
      )}
    >
      <span
        className="thinking-indicator-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg"
        aria-hidden="true"
      >
        🧠
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 break-words">{message}</p>
        <div className="thinking-indicator-dots mt-1.5 flex items-center gap-1" aria-hidden="true">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      </div>
    </div>
  );
}
