import type { EntityStat, StatsState } from './stats';
import { emptyEntityStat } from './stats';

/**
 * Leitner scheduling for revision — plan §6.4 and T5.3.
 *
 * Boxes 1–5, reviewed after 1, 2, 4, 8 and 16 *sessions*. Sessions rather than
 * days on purpose: revision is deliberately untimed (locked decision 5), and a
 * learner who does three decks in one sitting should not have everything come
 * back at once.
 */

export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

export const LOWEST_BOX: LeitnerBox = 1;
export const HIGHEST_BOX: LeitnerBox = 5;

/** Sessions to wait before a card in each box comes round again. */
export const REVIEW_INTERVALS: Record<LeitnerBox, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
};

export function intervalFor(box: LeitnerBox): number {
  return REVIEW_INTERVALS[box];
}

/** Knowing it moves the card up one box; not knowing it drops it to box 1. */
export function nextBox(box: LeitnerBox, knewIt: boolean): LeitnerBox {
  if (!knewIt) return LOWEST_BOX;
  return Math.min(box + 1, HIGHEST_BOX) as LeitnerBox;
}

/**
 * Whether a card is due, given how many revision sessions have happened since
 * it was last reviewed.
 */
export function isDue(box: LeitnerBox, sessionsSinceReview: number): boolean {
  return sessionsSinceReview >= intervalFor(box);
}

export interface RevisionCard {
  entityId: string;
  box: LeitnerBox;
  /** Session counter at the last review; 0 means never reviewed. */
  lastReviewedSession: number;
}

/** Applies one "knew it" / "didn't know it" to a card. */
export function reviewCard(
  card: RevisionCard,
  knewIt: boolean,
  currentSession: number,
): RevisionCard {
  return {
    entityId: card.entityId,
    box: nextBox(card.box, knewIt),
    lastReviewedSession: currentSession,
  };
}

/**
 * Reads a card out of the persisted stats. An entity with no record starts in
 * box 1 and is immediately due, which is what a brand-new learner wants.
 */
export function cardFor(state: Pick<StatsState, 'entityStats'>, entityId: string): RevisionCard {
  const stat: EntityStat = state.entityStats[entityId] ?? emptyEntityStat(entityId);
  return {
    entityId,
    box: stat.leitnerBox,
    lastReviewedSession: 0,
  };
}

/** Writes a reviewed card's box back into the stats state. */
export function applyReview<S extends StatsState>(
  state: S,
  entityId: string,
  knewIt: boolean,
): S {
  const existing = state.entityStats[entityId] ?? emptyEntityStat(entityId);
  const updated: EntityStat = {
    ...existing,
    leitnerBox: nextBox(existing.leitnerBox, knewIt),
  };
  return { ...state, entityStats: { ...state.entityStats, [entityId]: updated } };
}

/**
 * Orders a deck for review: lowest box first, so the material the learner
 * keeps forgetting comes round most often.
 *
 * Ties keep the caller's order, which is already shuffled by the deck builder,
 * so the same box does not always appear in the same sequence.
 */
export function orderByBox(
  state: Pick<StatsState, 'entityStats'>,
  entityIds: readonly string[],
): string[] {
  return [...entityIds].sort(
    (a, b) => cardFor(state, a).box - cardFor(state, b).box,
  );
}
