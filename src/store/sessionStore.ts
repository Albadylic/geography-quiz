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
import { useStatsStore } from './statsStore';
import { buildPool } from '@/engine/pool';
import { buildWeights, statModeForQuiz } from '@/engine/adaptive';

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

  start: (config: QuizConfig) => Session;
  /** Answers the current question by option id; `null` skips. */
  answer: (chosenId: string | null) => void;
  /** Records an answer graded elsewhere (expert and combo modes). */
  submit: (answer: Answer) => void;
  abandon: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  results: {},

  start: (config) => {
    // Hardest mode weights the pool by the player's own record (§8). The
    // weights are built here rather than in the engine, which may not reach
    // into storage. The country set travels inside `config.pool`, so nothing
    // else has to be threaded through.
    const weights =
      config.pool.source === 'hardest'
        ? buildWeights(
            useStatsStore.getState().data,
            buildPool(config).map((entity) => entity.id),
            statModeForQuiz(config.mode),
          )
        : undefined;

    const session = createSession(config, { ...(weights ? { weights } : {}) });
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

/**
 * Stores the advanced session, and once the run is over, its summary — and
 * commits the run to the persisted stats.
 *
 * Recording happens here rather than on the results screen so that stats are
 * written exactly once, whether the player looks at their results or closes
 * the tab straight away.
 */
function finish(
  set: (partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>)) => void,
  next: Session,
): void {
  if (next.currentIndex >= next.questions.length) {
    const result = summariseSession(next);
    useStatsStore.getState().recordFinishedSession(result, next.questions);
    set((state) => ({
      session: next,
      results: { ...state.results, [result.sessionId]: result },
    }));
    return;
  }
  set({ session: next });
}
