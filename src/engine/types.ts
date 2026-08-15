import type { Continent } from '@/data/schema';

/** Quiz types — plan §5.1. */

export type QuizMode = 'flags' | 'capitals' | 'combo';
export type Direction = 'a-to-b' | 'b-to-a' | 'mixed';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type QuizLength = 20 | 50 | 100 | 'all';
export type PoolSource = 'all' | 'hardest';

/**
 * Which countries are in play.
 *
 * A quiz over 250 entities is mostly territories nobody set out to learn, so
 * this is chosen per game and defaults to `un`. It sits in `QuizConfig.pool`
 * rather than only in Settings because it changes *which pool you played* —
 * which means it belongs in the high-score signature (§2).
 */
export type CountrySet = 'un' | 'un-plus-disputed' | 'all';

export const DEFAULT_COUNTRY_SET: CountrySet = 'un';

export interface PoolConfig {
  continents: Continent[] | 'all';
  source: PoolSource;
  countrySet: CountrySet;
}

export interface QuizConfig {
  mode: QuizMode;
  /**
   * flags: `a-to-b` is flag → name, `b-to-a` is name → flag.
   * capitals: `a-to-b` is country → capital, `b-to-a` is capital → country.
   * `mixed` picks per question.
   */
  direction: Direction;
  difficulty: Difficulty;
  length: QuizLength;
  pool: PoolConfig;
  seed: number;
}

export type PromptKind = 'flag' | 'name' | 'capital';
export type AnswerKind = 'flag' | 'name' | 'capital';

/**
 * The buckets per-entity stats are kept in (§8). Combo has no bucket of its
 * own: its two halves are recorded against flags and capitals separately,
 * which is what keeps the adaptive data clean (locked decision 3).
 */
export type StatMode = 'flags' | 'capitals';

/** One half of a combo question — §6.3. Each half is graded and scored alone. */
export interface QuestionHalf {
  statMode: StatMode;
  answerKind: AnswerKind;
  /** Entity ids, in display order. */
  options: string[];
  correctIds: string[];
}

export interface Question {
  id: string;
  entityId: string;
  prompt: {
    kind: PromptKind;
    /** Flag path, country name or capital name, according to `kind`. */
    value: string;
  };
  answerKind: AnswerKind;
  /**
   * Entity ids, in display order. Absent in expert mode, which is free text.
   *
   * Options are always *entity* ids even when the answer shown is a capital —
   * the label is that entity's primary capital. That keeps a country's own
   * secondary capitals (Cape Town, La Paz) from appearing as distractors
   * against itself, which would make the question unanswerable.
   */
  options?: string[];
  /**
   * Entity ids that count as correct. Normally one; an array because expert
   * grading accepts any of an entity's listed capitals (§3.3) and because
   * combo mode grades two halves.
   */
  correctIds: string[];
  /** Present only on combo questions: the two independent option groups. */
  halves?: QuestionHalf[];
}

export interface Answer {
  questionId: string;
  /** null = skipped. */
  given: string | null;
  correct: boolean;
  /**
   * Combo only: the outcome of each half, so a half-right answer earns half
   * the score and records two distinct per-entity outcomes (§6.3).
   */
  halfResults?: Partial<Record<StatMode, boolean>>;
  /** Combo only: what was chosen in each half, for the review list. */
  halfGiven?: Partial<Record<StatMode, string | null>>;
}

/** How many options each difficulty shows. Expert is free text (§6.1). */
export const OPTION_COUNT: Record<Exclude<Difficulty, 'expert'>, number> = {
  easy: 4,
  medium: 6,
  hard: 8,
};

export function optionCountFor(difficulty: Difficulty): number | null {
  return difficulty === 'expert' ? null : OPTION_COUNT[difficulty];
}
