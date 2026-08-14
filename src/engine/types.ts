import type { Continent } from '@/data/schema';

/** Quiz types — plan §5.1. */

export type QuizMode = 'flags' | 'capitals' | 'combo';
export type Direction = 'a-to-b' | 'b-to-a' | 'mixed';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type QuizLength = 20 | 50 | 100 | 'all';
export type PoolSource = 'all' | 'hardest';

export interface PoolConfig {
  continents: Continent[] | 'all';
  source: PoolSource;
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
}

export interface Answer {
  questionId: string;
  /** null = skipped. */
  given: string | null;
  correct: boolean;
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
