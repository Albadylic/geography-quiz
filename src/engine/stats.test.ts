import { describe, expect, it } from 'vitest';
import {
  emptyEntityStat,
  isMastered,
  masteredCount,
  outcomesFor,
  recordHighScore,
  recordOutcome,
  recordSession,
  recordStreak,
  statModeFor,
  summariseEntity,
  type StatsState,
} from './stats';
import { answerQuestion, createSession, summariseSession, type Session } from './session';
import type { Question, QuizConfig } from './types';

function emptyStats(): StatsState {
  return {
    entityStats: {},
    highScores: {},
    streaks: {},
    totals: { questionsAnswered: 0, correctAnswers: 0 },
  };
}

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'flags',
    direction: 'a-to-b',
    difficulty: 'easy',
    length: 20,
    pool: { continents: 'all', source: 'all' },
    seed: 2024,
    ...overrides,
  };
}

/** Plays a whole session, answering per the pattern. */
function play(session: Session, correctAt: (index: number) => boolean): Session {
  let current = session;
  for (let i = 0; i < session.questions.length; i++) {
    const question = current.questions[current.currentIndex]!;
    const chosen = correctAt(i)
      ? question.correctIds[0]!
      : question.options!.find((id) => !question.correctIds.includes(id))!;
    current = answerQuestion(current, chosen);
  }
  return current;
}

describe('which bucket an answer lands in', () => {
  it('records a flag question against flags, either direction', () => {
    expect(statModeFor({ prompt: { kind: 'flag', value: '' }, answerKind: 'name' })).toBe('flags');
    expect(statModeFor({ prompt: { kind: 'name', value: '' }, answerKind: 'flag' })).toBe('flags');
  });

  it('records a capital question against capitals, either direction', () => {
    expect(statModeFor({ prompt: { kind: 'name', value: '' }, answerKind: 'capital' })).toBe(
      'capitals',
    );
    expect(statModeFor({ prompt: { kind: 'capital', value: '' }, answerKind: 'name' })).toBe(
      'capitals',
    );
  });
});

describe('recordOutcome', () => {
  it('counts a correct answer and stamps when it was seen', () => {
    const state = recordOutcome(emptyStats(), 'france', 'flags', true, 1000);
    expect(state.entityStats.france!.byMode.flags).toEqual({
      correct: 1,
      wrong: 0,
      lastSeen: 1000,
    });
    expect(state.totals).toEqual({ questionsAnswered: 1, correctAnswers: 1 });
  });

  it('counts a wrong answer', () => {
    const state = recordOutcome(emptyStats(), 'chad', 'flags', false, 2000);
    expect(state.entityStats.chad!.byMode.flags).toEqual({
      correct: 0,
      wrong: 1,
      lastSeen: 2000,
    });
    expect(state.totals).toEqual({ questionsAnswered: 1, correctAnswers: 0 });
  });

  it('keeps the two modes separate for the same country', () => {
    let state = recordOutcome(emptyStats(), 'peru', 'flags', true, 10);
    state = recordOutcome(state, 'peru', 'capitals', false, 20);

    expect(state.entityStats.peru!.byMode.flags.correct).toBe(1);
    expect(state.entityStats.peru!.byMode.capitals.wrong).toBe(1);
    expect(state.entityStats.peru!.byMode.flags.wrong).toBe(0);
  });

  it('does not mutate the state it is given', () => {
    const before = emptyStats();
    const snapshot = structuredClone(before);
    recordOutcome(before, 'france', 'flags', true, 1);
    expect(before).toEqual(snapshot);
  });
});

describe('streaks carry across sessions (§9)', () => {
  it('extends within a mode and records the longest', () => {
    let state: StatsState = emptyStats();
    for (let i = 0; i < 4; i++) state = recordStreak(state, 'flags', true);
    expect(state.streaks.flags).toEqual({ current: 4, longest: 4 });
  });

  it('breaks on a wrong answer but keeps the longest', () => {
    let state: StatsState = emptyStats();
    for (let i = 0; i < 6; i++) state = recordStreak(state, 'flags', true);
    state = recordStreak(state, 'flags', false);
    expect(state.streaks.flags).toEqual({ current: 0, longest: 6 });
  });

  /** The T3.2 acceptance criterion. */
  it('continues a streak from one session into the next', () => {
    let state: StatsState = emptyStats();
    // Session one: three correct, no wrong answer to break it.
    for (let i = 0; i < 3; i++) state = recordStreak(state, 'flags', true);
    expect(state.streaks.flags!.current).toBe(3);

    // Session two picks up where it left off.
    for (let i = 0; i < 4; i++) state = recordStreak(state, 'flags', true);
    expect(state.streaks.flags).toEqual({ current: 7, longest: 7 });
  });

  it('keeps a global streak alongside the per-mode one', () => {
    let state: StatsState = emptyStats();
    state = recordStreak(state, 'flags', true);
    state = recordStreak(state, 'capitals', true);

    expect(state.streaks.global).toEqual({ current: 2, longest: 2 });
    expect(state.streaks.flags!.current).toBe(1);
    expect(state.streaks.capitals!.current).toBe(1);
  });

  it('does not let one mode break another mode streak', () => {
    let state: StatsState = emptyStats();
    for (let i = 0; i < 3; i++) state = recordStreak(state, 'flags', true);
    state = recordStreak(state, 'capitals', false);

    expect(state.streaks.flags!.current).toBe(3);
    expect(state.streaks.capitals!.current).toBe(0);
    // ...but the global streak does break.
    expect(state.streaks.global!.current).toBe(0);
  });

  it('gives combo its own streak bucket', () => {
    let state: StatsState = emptyStats();
    state = recordStreak(state, 'combo', true);
    expect(state.streaks.combo).toEqual({ current: 1, longest: 1 });
    expect(state.streaks.flags).toBeUndefined();
  });
});

describe('high scores are scoped by config signature (§2)', () => {
  const result = (signature: string, score: number) => ({
    signature,
    score,
    accuracy: 1,
    longestStreak: 3,
    timestamp: 100,
  });

  it('records the first score for a signature', () => {
    const state = recordHighScore(emptyStats(), result('flags|easy', 100));
    expect(state.highScores['flags|easy']!.score).toBe(100);
  });

  /** The T3.2 acceptance criterion. */
  it('lets two runs of the same config compete for one entry', () => {
    let state: StatsState = recordHighScore(emptyStats(), result('flags|easy', 100));
    state = recordHighScore(state, result('flags|easy', 150));
    expect(Object.keys(state.highScores)).toHaveLength(1);
    expect(state.highScores['flags|easy']!.score).toBe(150);
  });

  it('does not lower an existing high score', () => {
    let state: StatsState = recordHighScore(emptyStats(), result('flags|easy', 150));
    state = recordHighScore(state, result('flags|easy', 90));
    expect(state.highScores['flags|easy']!.score).toBe(150);
  });

  it('keeps a different config on its own entry', () => {
    let state: StatsState = recordHighScore(emptyStats(), result('flags|easy', 100));
    state = recordHighScore(state, result('flags|hard', 40));

    expect(Object.keys(state.highScores).sort()).toEqual(['flags|easy', 'flags|hard']);
    // The harder run scored fewer points but keeps its own record.
    expect(state.highScores['flags|hard']!.score).toBe(40);
  });
});

describe('recordSession', () => {
  it('records one outcome per answered question', () => {
    const session = play(createSession(config({ length: 20 })), () => true);
    const result = summariseSession(session);
    const state = recordSession(emptyStats(), result, session.questions, 500);

    expect(state.totals.questionsAnswered).toBe(20);
    expect(state.totals.correctAnswers).toBe(20);
    expect(Object.keys(state.entityStats)).toHaveLength(20);
  });

  it('records against the country the question was about', () => {
    const session = play(createSession(config({ length: 20 })), () => true);
    const result = summariseSession(session);
    const state = recordSession(emptyStats(), result, session.questions, 500);

    for (const question of session.questions) {
      expect(state.entityStats[question.entityId]!.byMode.flags.correct).toBe(1);
    }
  });

  it('records a capitals session against the capitals bucket', () => {
    const session = play(createSession(config({ mode: 'capitals', length: 20 })), () => true);
    const result = summariseSession(session);
    const state = recordSession(emptyStats(), result, session.questions, 500);

    const first = session.questions[0]!;
    expect(state.entityStats[first.entityId]!.byMode.capitals.correct).toBe(1);
    expect(state.entityStats[first.entityId]!.byMode.flags.correct).toBe(0);
  });

  it('stores the high score for the session config', () => {
    const session = play(createSession(config({ length: 20 })), () => true);
    const result = summariseSession(session);
    const state = recordSession(emptyStats(), result, session.questions, 500);

    expect(state.highScores[result.signature]!.score).toBe(result.score);
  });

  it('ignores an answer whose question it cannot find', () => {
    const session = play(createSession(config({ length: 20 })), () => true);
    const result = summariseSession(session);
    const state = recordSession(emptyStats(), result, [], 500);

    expect(state.totals.questionsAnswered).toBe(0);
  });

  it('accumulates across two sessions', () => {
    const first = play(createSession(config({ length: 20, seed: 1 })), () => true);
    const second = play(createSession(config({ length: 20, seed: 2 })), () => true);

    let state: StatsState = recordSession(
      emptyStats(),
      summariseSession(first),
      first.questions,
      1,
    );
    state = recordSession(state, summariseSession(second), second.questions, 2);

    expect(state.totals.questionsAnswered).toBe(40);
  });
});

describe('combo records two outcomes per question (locked decision 3)', () => {
  const comboQuestion: Question = {
    id: 'q1-peru',
    entityId: 'peru',
    prompt: { kind: 'name', value: 'Peru' },
    answerKind: 'flag',
    correctIds: ['peru'],
    halves: [
      { statMode: 'flags', answerKind: 'flag', options: ['peru'], correctIds: ['peru'] },
      { statMode: 'capitals', answerKind: 'capital', options: ['peru'], correctIds: ['peru'] },
    ],
  };

  it('splits a fully correct answer into two correct outcomes', () => {
    const outcomes = outcomesFor(comboQuestion, {
      questionId: 'q1-peru',
      given: null,
      correct: true,
      halfResults: { flags: true, capitals: true },
    });

    expect(outcomes).toEqual([
      { entityId: 'peru', mode: 'flags', correct: true },
      { entityId: 'peru', mode: 'capitals', correct: true },
    ]);
  });

  it('records a half-right answer as one right and one wrong', () => {
    const outcomes = outcomesFor(comboQuestion, {
      questionId: 'q1-peru',
      given: null,
      correct: false,
      halfResults: { flags: true, capitals: false },
    });

    expect(outcomes).toEqual([
      { entityId: 'peru', mode: 'flags', correct: true },
      { entityId: 'peru', mode: 'capitals', correct: false },
    ]);
  });

  it('produces exactly one outcome for an ordinary question', () => {
    const outcomes = outcomesFor(
      {
        id: 'q1-peru',
        entityId: 'peru',
        prompt: { kind: 'flag', value: '/flags/pe.svg' },
        answerKind: 'name',
        correctIds: ['peru'],
      },
      { questionId: 'q1-peru', given: 'peru', correct: true },
    );
    expect(outcomes).toEqual([{ entityId: 'peru', mode: 'flags', correct: true }]);
  });
});

describe('derived views for the stats screen (§9)', () => {
  it('sums both modes for one entity', () => {
    const stat = emptyEntityStat('france');
    stat.byMode.flags = { correct: 3, wrong: 1, lastSeen: 50 };
    stat.byMode.capitals = { correct: 1, wrong: 3, lastSeen: 90 };

    expect(summariseEntity(stat)).toEqual({
      entityId: 'france',
      correct: 4,
      wrong: 4,
      seen: 8,
      accuracy: 0.5,
      lastSeen: 90,
    });
  });

  it('treats an unseen entity as zero accuracy rather than dividing by zero', () => {
    expect(summariseEntity(emptyEntityStat('niue')).accuracy).toBe(0);
  });

  it('counts a country as mastered at 3 correct and 80% (§9)', () => {
    const mastered = { entityId: 'a', correct: 4, wrong: 1, seen: 5, accuracy: 0.8, lastSeen: 0 };
    expect(isMastered(mastered)).toBe(true);
  });

  it('does not count a country with too few correct answers', () => {
    const few = { entityId: 'a', correct: 2, wrong: 0, seen: 2, accuracy: 1, lastSeen: 0 };
    expect(isMastered(few)).toBe(false);
  });

  it('does not count a country below the accuracy threshold', () => {
    const shaky = { entityId: 'a', correct: 3, wrong: 3, seen: 6, accuracy: 0.5, lastSeen: 0 };
    expect(isMastered(shaky)).toBe(false);
  });

  it('counts mastered countries across the whole state', () => {
    let state: StatsState = emptyStats();
    for (let i = 0; i < 4; i++) state = recordOutcome(state, 'france', 'flags', true, i);
    for (let i = 0; i < 4; i++) state = recordOutcome(state, 'chad', 'flags', false, i);
    expect(masteredCount(state)).toBe(1);
  });
});
