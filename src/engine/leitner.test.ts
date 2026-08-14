import { describe, expect, it } from 'vitest';
import {
  applyReview,
  cardFor,
  intervalFor,
  isDue,
  nextBox,
  orderByBox,
  reviewCard,
  REVIEW_INTERVALS,
  type LeitnerBox,
} from './leitner';
import { emptyEntityStat, type StatsState } from './stats';

function stateWithBoxes(boxes: Record<string, LeitnerBox>): Pick<StatsState, 'entityStats'> {
  const entityStats: StatsState['entityStats'] = {};
  for (const [id, box] of Object.entries(boxes)) {
    entityStats[id] = { ...emptyEntityStat(id), leitnerBox: box };
  }
  return { entityStats };
}

describe('intervals (§6.4)', () => {
  it('follows the 1/2/4/8/16 ladder', () => {
    expect(REVIEW_INTERVALS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
  });

  it('doubles at each box', () => {
    for (const box of [1, 2, 3, 4] as LeitnerBox[]) {
      expect(intervalFor((box + 1) as LeitnerBox)).toBe(intervalFor(box) * 2);
    }
  });
});

describe('moving between boxes', () => {
  it('promotes one box when the learner knew it', () => {
    expect(nextBox(1, true)).toBe(2);
    expect(nextBox(3, true)).toBe(4);
  });

  it('stops at the top box', () => {
    expect(nextBox(5, true)).toBe(5);
  });

  it('drops all the way to box 1 when they did not', () => {
    for (const box of [1, 2, 3, 4, 5] as LeitnerBox[]) {
      expect(nextBox(box, false)).toBe(1);
    }
  });
});

describe('being due', () => {
  it('is due once the interval has passed', () => {
    expect(isDue(1, 1)).toBe(true);
    expect(isDue(3, 4)).toBe(true);
    expect(isDue(5, 20)).toBe(true);
  });

  it('is not due before the interval', () => {
    expect(isDue(2, 1)).toBe(false);
    expect(isDue(5, 15)).toBe(false);
  });

  it('makes a box-1 card due at the next session', () => {
    expect(isDue(1, 0)).toBe(false);
    expect(isDue(1, 1)).toBe(true);
  });
});

describe('reviewing a card', () => {
  const card = { entityId: 'chad', box: 2 as LeitnerBox, lastReviewedSession: 3 };

  it('promotes and stamps the session on a hit', () => {
    expect(reviewCard(card, true, 7)).toEqual({
      entityId: 'chad',
      box: 3,
      lastReviewedSession: 7,
    });
  });

  it('demotes to box 1 on a miss', () => {
    expect(reviewCard(card, false, 7).box).toBe(1);
  });
});

describe('reading and writing cards through the stats state', () => {
  it('starts an unknown entity in box 1', () => {
    expect(cardFor({ entityStats: {} }, 'niue').box).toBe(1);
  });

  it('reads a stored box', () => {
    expect(cardFor(stateWithBoxes({ chad: 4 }), 'chad').box).toBe(4);
  });

  it('writes a promotion back into the state', () => {
    const state: StatsState = {
      ...stateWithBoxes({ chad: 2 }),
      highScores: {},
      streaks: {},
      totals: { questionsAnswered: 0, correctAnswers: 0 },
    };
    expect(applyReview(state, 'chad', true).entityStats.chad!.leitnerBox).toBe(3);
    expect(applyReview(state, 'chad', false).entityStats.chad!.leitnerBox).toBe(1);
  });

  it('creates a record for an entity that has never been seen', () => {
    const state: StatsState = {
      entityStats: {},
      highScores: {},
      streaks: {},
      totals: { questionsAnswered: 0, correctAnswers: 0 },
    };
    const next = applyReview(state, 'tuvalu', true);
    expect(next.entityStats.tuvalu!.leitnerBox).toBe(2);
  });

  it('does not mutate the state it is given', () => {
    const state: StatsState = {
      ...stateWithBoxes({ chad: 2 }),
      highScores: {},
      streaks: {},
      totals: { questionsAnswered: 0, correctAnswers: 0 },
    };
    const snapshot = structuredClone(state);
    applyReview(state, 'chad', true);
    expect(state).toEqual(snapshot);
  });

  it('leaves the rest of an entity stats untouched when reviewing', () => {
    const base = emptyEntityStat('chad');
    base.byMode.flags = { correct: 3, wrong: 1, lastSeen: 99 };
    const state: StatsState = {
      entityStats: { chad: base },
      highScores: {},
      streaks: {},
      totals: { questionsAnswered: 4, correctAnswers: 3 },
    };

    const next = applyReview(state, 'chad', true);
    expect(next.entityStats.chad!.byMode.flags).toEqual({ correct: 3, wrong: 1, lastSeen: 99 });
    expect(next.totals).toEqual({ questionsAnswered: 4, correctAnswers: 3 });
  });
});

describe('deck ordering', () => {
  it('puts the least-known cards first', () => {
    const state = stateWithBoxes({ easy: 5, medium: 3, hard: 1 });
    expect(orderByBox(state, ['easy', 'medium', 'hard'])).toEqual(['hard', 'medium', 'easy']);
  });

  it('treats never-seen cards as box 1, so new material comes first', () => {
    const state = stateWithBoxes({ known: 4 });
    expect(orderByBox(state, ['known', 'brand-new'])).toEqual(['brand-new', 'known']);
  });

  it('keeps the caller order within a box, so a shuffled deck stays shuffled', () => {
    const state = stateWithBoxes({ a: 2, b: 2, c: 2 });
    expect(orderByBox(state, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the list it is given', () => {
    const ids = ['b', 'a'];
    orderByBox(stateWithBoxes({ a: 1, b: 3 }), ids);
    expect(ids).toEqual(['b', 'a']);
  });
});
