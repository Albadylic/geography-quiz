import type { Answer, AnswerKind, Question, QuizMode, StatMode } from './types';
import type { SessionResult } from './session';

/**
 * Stats recording — plan §8 and §9. Pure functions over the stats state:
 * given the old state and a finished session, produce the new state.
 *
 * The *shapes* live here rather than in storage/ for two reasons: they are
 * domain concepts §8 defines, and engine/ may not import storage/ (§4). The
 * storage layer imports these and adds only what persistence needs — a version
 * number and the user's settings.
 */

export interface ModeStat {
  correct: number;
  wrong: number;
  /** Epoch ms of the last time this entity was asked in this mode. */
  lastSeen: number;
}

export interface EntityStat {
  entityId: string;
  byMode: Record<StatMode, ModeStat>;
  leitnerBox: 1 | 2 | 3 | 4 | 5;
}

export interface HighScore {
  /** The full config signature this score belongs to (§2). */
  signature: string;
  score: number;
  accuracy: number;
  longestStreak: number;
  timestamp: number;
}

/** Streaks carry across sessions within a mode (§9). */
export interface StreakRecord {
  current: number;
  longest: number;
}

export type StreakKey = StatMode | 'combo' | 'global';

/**
 * Everything the stats functions read and write. The persisted state is this
 * plus a version and settings, so these functions are generic over it and
 * return the caller's own type unchanged.
 */
export interface StatsState {
  entityStats: Record<string, EntityStat>;
  highScores: Record<string, HighScore>;
  streaks: Partial<Record<StreakKey, StreakRecord>>;
  totals: { questionsAnswered: number; correctAnswers: number };
}

export function emptyModeStat(): ModeStat {
  return { correct: 0, wrong: 0, lastSeen: 0 };
}

export function emptyEntityStat(entityId: string): EntityStat {
  return {
    entityId,
    byMode: { flags: emptyModeStat(), capitals: emptyModeStat() },
    leitnerBox: 1,
  };
}

/**
 * Which stat bucket an answer belongs in.
 *
 * A question is recorded against what it *tested*, not against the mode the
 * player selected: a "which country has this capital" question is a capitals
 * question whichever way round it was asked. Combo has no bucket of its own —
 * its halves land in flags and capitals (locked decision 3).
 */
export function statModeFor(question: Pick<Question, 'prompt' | 'answerKind'>): StatMode {
  const kinds: AnswerKind[] = [question.prompt.kind, question.answerKind];
  return kinds.includes('capital') ? 'capitals' : 'flags';
}

function statFor(state: StatsState, entityId: string): EntityStat {
  return state.entityStats[entityId] ?? emptyEntityStat(entityId);
}

/** Records one graded outcome against one entity in one mode. */
export function recordOutcome<S extends StatsState>(
  state: S,
  entityId: string,
  mode: StatMode,
  correct: boolean,
  now: number,
): S {
  const existing = statFor(state, entityId);
  const bucket = existing.byMode[mode];

  const updated: EntityStat = {
    ...existing,
    byMode: {
      ...existing.byMode,
      [mode]: {
        correct: bucket.correct + (correct ? 1 : 0),
        wrong: bucket.wrong + (correct ? 0 : 1),
        lastSeen: now,
      },
    },
  };

  return {
    ...state,
    entityStats: { ...state.entityStats, [entityId]: updated },
    totals: {
      questionsAnswered: state.totals.questionsAnswered + 1,
      correctAnswers: state.totals.correctAnswers + (correct ? 1 : 0),
    },
  };
}

/** Which streak buckets a mode contributes to (§9: global and per mode). */
function streakKeysFor(mode: QuizMode): StreakKey[] {
  if (mode === 'combo') return ['combo', 'global'];
  return [mode, 'global'];
}

/**
 * Advances a streak record. Streaks count consecutive correct answers and
 * carry **across** sessions within a mode (§9), so `current` is deliberately
 * never reset at a session boundary — only by a wrong answer.
 */
function advanceStreak(record: StreakRecord | undefined, correct: boolean): StreakRecord {
  const previous = record ?? { current: 0, longest: 0 };
  const current = correct ? previous.current + 1 : 0;
  return { current, longest: Math.max(previous.longest, current) };
}

export function recordStreak<S extends StatsState>(
  state: S,
  mode: QuizMode,
  correct: boolean,
): S {
  const streaks = { ...state.streaks };
  for (const key of streakKeysFor(mode)) {
    streaks[key] = advanceStreak(streaks[key], correct);
  }
  return { ...state, streaks };
}

/**
 * A high score is kept per config signature (§2), so a 20-question easy Europe
 * run never competes with a 100-question expert world run.
 */
export function recordHighScore<S extends StatsState>(
  state: S,
  result: Pick<SessionResult, 'signature' | 'score' | 'accuracy' | 'longestStreak' | 'timestamp'>,
): S {
  const existing = state.highScores[result.signature];
  if (existing && existing.score >= result.score) return state;

  const entry: HighScore = {
    signature: result.signature,
    score: result.score,
    accuracy: result.accuracy,
    longestStreak: result.longestStreak,
    timestamp: result.timestamp,
  };
  return { ...state, highScores: { ...state.highScores, [result.signature]: entry } };
}

/** One graded outcome to record. Combo produces two of these per question. */
export interface Outcome {
  entityId: string;
  mode: StatMode;
  correct: boolean;
}

/**
 * Everything a finished session changes: per-entity stats, streaks, totals and
 * possibly a high score.
 *
 * Answers are matched to their questions by id rather than by position, so a
 * session that skipped or reordered anything still records against the right
 * country.
 */
export function recordSession<S extends StatsState>(
  state: S,
  result: SessionResult,
  questions: readonly Question[],
  now: number = Date.now(),
): S {
  const byQuestionId = new Map(questions.map((question) => [question.id, question]));
  let next = state;

  for (const answer of result.answers) {
    const question = byQuestionId.get(answer.questionId);
    if (!question) continue;

    for (const outcome of outcomesFor(question, answer)) {
      next = recordOutcome(next, outcome.entityId, outcome.mode, outcome.correct, now);
    }
    next = recordStreak(next, result.config.mode, answer.correct);
  }

  return recordHighScore(next, result);
}

/**
 * The outcomes one answer produces. Ordinary questions produce one; combo
 * produces two, one against flags and one against capitals, which is what
 * keeps the adaptive data clean (§6.3, locked decision 3).
 */
export function outcomesFor(question: Question, answer: Answer): Outcome[] {
  if (question.halves) {
    return question.halves.map((half) => ({
      entityId: question.entityId,
      mode: half.statMode,
      correct: answer.halfResults?.[half.statMode] ?? false,
    }));
  }

  return [
    {
      entityId: question.entityId,
      mode: statModeFor(question),
      correct: answer.correct,
    },
  ];
}

// ---------------------------------------------------------------------------
// Derived views for the stats screen (§9)
// ---------------------------------------------------------------------------

export interface EntitySummary {
  entityId: string;
  correct: number;
  wrong: number;
  seen: number;
  accuracy: number;
  lastSeen: number;
}

/** Totals across both modes for one entity. */
export function summariseEntity(stat: EntityStat): EntitySummary {
  const correct = stat.byMode.flags.correct + stat.byMode.capitals.correct;
  const wrong = stat.byMode.flags.wrong + stat.byMode.capitals.wrong;
  const seen = correct + wrong;
  return {
    entityId: stat.entityId,
    correct,
    wrong,
    seen,
    accuracy: seen === 0 ? 0 : correct / seen,
    lastSeen: Math.max(stat.byMode.flags.lastSeen, stat.byMode.capitals.lastSeen),
  };
}

/** "Countries mastered": at least 3 correct and at least 80% (§9). */
export function isMastered(summary: EntitySummary): boolean {
  return summary.correct >= 3 && summary.accuracy >= 0.8;
}

export function masteredCount(state: StatsState): number {
  return Object.values(state.entityStats)
    .map(summariseEntity)
    .filter(isMastered).length;
}

/** How many graded answers the player has ever given — gates Hardest (§8). */
export function totalAnswered(state: StatsState): number {
  return state.totals.questionsAnswered;
}

/**
 * Hardest mode stays locked until the player has answered this many questions,
 * because before that it would be selecting from almost no evidence (§8).
 */
export const HARDEST_UNLOCK_THRESHOLD = 20;

/**
 * Error rate with Laplace smoothing, per §8:
 *
 *     (wrong + 1) / (correct + wrong + 2)
 *
 * The smoothing is what stops a single wrong answer from dominating the
 * ranking. This is the first term of the full adaptive weight; recency and the
 * unseen factor arrive with T5.1.
 */
export function smoothedErrorRate(stat: { correct: number; wrong: number }): number {
  return (stat.wrong + 1) / (stat.correct + stat.wrong + 2);
}
