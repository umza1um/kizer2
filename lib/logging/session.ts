const SESSION_KEY = "kizer-tech-log-session-id";

let sessionId: string | null = null;

export function getSessionId(): string {
  if (typeof window === "undefined") return "server";

  if (sessionId) return sessionId;

  const stored = window.sessionStorage.getItem(SESSION_KEY);
  if (stored) {
    sessionId = stored;
    return stored;
  }

  const created = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  window.sessionStorage.setItem(SESSION_KEY, created);
  sessionId = created;
  return created;
}
