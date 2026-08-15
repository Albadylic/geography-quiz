import { gradeChoice } from './grading';
import { generateQuestions, type GenerateOptions } from './questions';
import type { Answer, Difficulty, Question, QuizConfig } from './types';

/**
 * Session lifecycle and scoring — plan §5.4.
 *
 * A session is a plain immutable value. `answerQuestion` returns a new session
 * rather than mutating, so the store can hold it, the results screen can read
 * it after navigation, and tests can replay a scripted run.
 *
 * Locked decision 1: a wrong answer breaks the streak but never ends the run.
 * Locked decision 5: there is no timer. No per-question duration is captured
 * and no time term appears anywhere in the scoring below.
 */

export const BASE_SCORE = 10;

/** §5.4 difficulty multipliers. */
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.3,
  hard: 1.6,
  expert: 2.2,
};

export const MAX_STREAK_BONUS = 5;

/**
 * `min(floor(streak / 5), 5)` where `streak` is the run *including* this
 * answer — so the fifth consecutive correct answer is the first to earn +1.
 */
export function streakBonus(currentStreak: number): number {
  if (currentStreak <= 0) return 0;
  return Math.min(Math.floor(currentStreak / 5), MAX_STREAK_BONUS);
}

/**
 * Points for a partially correct answer, where `credit` runs 0..1.
 *
 * Combo is the only mode that produces anything between the two: §6.3 scores
 * each half separately, so a half-right answer earns half. The streak bonus is
 * only added for a *fully* correct answer — it rewards an unbroken run, and a
 * half-right answer has broken it.
 */
export function scoreForCredit(
  credit: number,
  difficulty: Difficulty,
  currentStreak: number,
): number {
  const clamped = Math.max(0, Math.min(1, credit));
  if (clamped === 0) return 0;
  const points = Math.round(BASE_SCORE * DIFFICULTY_MULTIPLIER[difficulty] * clamped);
  return points + (clamped >= 1 ? streakBonus(currentStreak) : 0);
}

/** Points for a single answer. Wrong and skipped both score zero. */
export function questionScore(
  correct: boolean,
  difficulty: Difficulty,
  currentStreak: number,
): number {
  return scoreForCredit(correct ? 1 : 0, difficulty, currentStreak);
}

/**
 * How much of a question was answered correctly. One for an ordinary right
 * answer, and the fraction of halves right for a combo question.
 */
export function creditFor(answer: Answer): number {
  if (!answer.halfResults) return answer.correct ? 1 : 0;

  const results = Object.values(answer.halfResults);
  if (results.length === 0) return answer.correct ? 1 : 0;
  return results.filter(Boolean).length / results.length;
}

export interface Session {
  id: string;
  config: QuizConfig;
  questions: Question[];
  answers: Answer[];
  /** Index of the question awaiting an answer. Equals length when finished. */
  currentIndex: number;
  score: number;
  /** Consecutive correct answers right now. */
  currentStreak: number;
  /** Longest run of consecutive correct answers within this session. */
  longestStreak: number;
  startedAt: number;
  finishedAt: number | null;
}

export interface CreateSessionOptions extends GenerateOptions {
  /** Injectable so tests and the store control ids rather than the clock. */
  id?: string;
  now?: number;
}

export function createSession(
  config: QuizConfig,
  options: CreateSessionOptions = {},
): Session {
  const { questions } = generateQuestions(config, options);
  const now = options.now ?? Date.now();
  return {
    id: options.id ?? `s${now}-${config.seed}`,
    config,
    questions,
    answers: [],
    currentIndex: 0,
    score: 0,
    currentStreak: 0,
    longestStreak: 0,
    startedAt: now,
    finishedAt: null,
  };
}

export function currentQuestion(session: Session): Question | undefined {
  return session.questions[session.currentIndex];
}

export function isFinished(session: Session): boolean {
  return session.currentIndex >= session.questions.length;
}

/**
 * Records an already-graded answer and advances. Kept separate from
 * `answerQuestion` so expert mode (T2.4) and combo mode (T4.1), which grade
 * differently, can share the scoring and advance logic.
 */
export function recordAnswer(
  session: Session,
  answer: Answer,
  /** Injectable like the rest of the module, so the finish time is testable. */
  now: number = Date.now(),
): Session {
  if (isFinished(session)) return session;

  // A combo answer counts for the streak only when both halves were right —
  // `answer.correct` already means "wholly correct" for every mode.
  const currentStreak = answer.correct ? session.currentStreak + 1 : 0;
  const gained = scoreForCredit(
    creditFor(answer),
    session.config.difficulty,
    currentStreak,
  );
  const currentIndex = session.currentIndex + 1;
  const finished = currentIndex >= session.questions.length;

  return {
    ...session,
    answers: [...session.answers, answer],
    currentIndex,
    score: session.score + gained,
    currentStreak,
    longestStreak: Math.max(session.longestStreak, currentStreak),
    finishedAt: finished ? (session.finishedAt ?? now) : session.finishedAt,
  };
}

/** Answers the current question by option id. `null` skips it. */
export function answerQuestion(
  session: Session,
  chosenId: string | null,
  now?: number,
): Session {
  const question = currentQuestion(session);
  if (!question) return session;
  return recordAnswer(session, gradeChoice(question, chosenId), now);
}

export interface SessionResult {
  sessionId: string;
  config: QuizConfig;
  score: number;
  /** 0..1 over every question in the session, skips counting as wrong. */
  accuracy: number;
  correctCount: number;
  questionCount: number;
  longestStreak: number;
  answers: Answer[];
  /** Config signature, so high scores are scoped per §2. */
  signature: string;
  timestamp: number;
}

/**
 * The full config signature high scores are keyed by (§2): a 20-question easy
 * Europe run and a 100-question expert world run are not the same achievement.
 * The seed is deliberately excluded — it identifies a particular quiz, not a
 * category of achievement.
 *
 * `countrySet` is part of it for the same reason everything else is: 195
 * countries and 250 countries are not the same test. The narrower set drops the
 * territories nobody recognises *and* easy mode then biases what is left
 * towards familiar countries, so a `un` score would otherwise displace an `all`
 * score on merit it did not earn.
 */
export function configSignature(config: QuizConfig): string {
  const continents =
    config.pool.continents === 'all'
      ? 'all'
      : [...config.pool.continents].sort().join('+');
  return [
    config.mode,
    config.direction,
    config.difficulty,
    String(config.length),
    continents,
    config.pool.source,
    config.pool.countrySet,
  ].join('|');
}

export function summariseSession(session: Session): SessionResult {
  const correctCount = session.answers.filter((answer) => answer.correct).length;
  const questionCount = session.questions.length;
  return {
    sessionId: session.id,
    config: session.config,
    score: session.score,
    accuracy: questionCount === 0 ? 0 : correctCount / questionCount,
    correctCount,
    questionCount,
    longestStreak: session.longestStreak,
    answers: session.answers,
    signature: configSignature(session.config),
    timestamp: session.finishedAt ?? session.startedAt,
  };
}
