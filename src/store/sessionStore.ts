import { create } from 'zustand';
import {
  answerQuestion,
  createSession,
  summariseSession,
  type Session,
  type SessionResult,
} from '@/engine/session';
import type { Answer, QuizConfig } from '@/engine/types';
import { recordAnswer } from '@/engine/session';

/**
 * The live session lives here rather than in a route or in context, so it
 * survives navigating to the results screen (plan §4).
 *
 * This store holds no quiz logic — it calls the engine and stores what comes
 * back. Anything that decides *what* is correct or *how much* it scores
 * belongs in engine/.
 */
interface SessionState {
  session: Session | null;
  /** Finished runs, keyed by session id, for /results/:sessionId. */
  results: Record<string, SessionResult>;

  start: (config: QuizConfig, options?: { unMembersOnly?: boolean }) => Session;
  /** Answers the current question by option id; `null` skips. */
  answer: (chosenId: string | null) => void;
  /** Records an answer graded elsewhere (expert and combo modes). */
  submit: (answer: Answer) => void;
  abandon: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  results: {},

  start: (config, options = {}) => {
    const session = createSession(config, {
      ...(options.unMembersOnly === undefined
        ? {}
        : { unMembersOnly: options.unMembersOnly }),
    });
    set({ session });
    return session;
  },

  answer: (chosenId) => {
    const { session } = get();
    if (!session) return;
    finish(set, answerQuestion(session, chosenId));
  },

  submit: (answer) => {
    const { session } = get();
    if (!session) return;
    finish(set, recordAnswer(session, answer));
  },

  abandon: () => set({ session: null }),
}));

/** Stores the advanced session, and its summary once the run is over. */
function finish(
  set: (partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>)) => void,
  next: Session,
): void {
  if (next.currentIndex >= next.questions.length) {
    const result = summariseSession(next);
    set((state) => ({
      session: next,
      results: { ...state.results, [result.sessionId]: result },
    }));
    return;
  }
  set({ session: next });
}
