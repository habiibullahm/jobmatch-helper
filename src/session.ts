import type { ChatSession, SessionStep } from "./types.js";

const sessions = new Map<number, ChatSession>();

export function getSession(chatId: number): ChatSession {
  let session = sessions.get(chatId);
  if (!session) {
    session = { step: "idle" };
    sessions.set(chatId, session);
  }
  return session;
}

export function setStep(
  chatId: number,
  step: SessionStep,
  prefsText?: string | null,
): ChatSession {
  const session = getSession(chatId);
  session.step = step;
  if (prefsText === null) {
    delete session.prefsText;
  } else if (prefsText !== undefined) {
    session.prefsText = prefsText;
  }
  return session;
}

export function setLastFileUniqueId(chatId: number, fileUniqueId: string): void {
  getSession(chatId).lastFileUniqueId = fileUniqueId;
}

export function clearSession(chatId: number): void {
  const prev = sessions.get(chatId);
  const lastFileUniqueId = prev?.lastFileUniqueId;
  sessions.delete(chatId);
  if (lastFileUniqueId) {
    // Keep dedupe id across a soft clear of step machine within same sitting.
    const next = getSession(chatId);
    next.lastFileUniqueId = lastFileUniqueId;
    next.step = "idle";
  }
}

export function hardClearSession(chatId: number): void {
  sessions.delete(chatId);
}
