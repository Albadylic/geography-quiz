import { describe, expect, it } from 'vitest';
import {
  answerQuestion,
  configSignature,
  createSession,
  currentQuestion,
  isFinished,
  questionScore,
  streakBonus,
  summariseSession,
  type Session,
} from './session';
import { gradeChoice } from './grading';
import type { Difficulty, QuizConfig } from './types';

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'flags',
    direction: 'a-to-b',
    difficulty: 'easy',
    length: 20,
    pool: { continents: 'all', source: 'all', countrySet: 'all' },
    seed: 555,
    ...overrides,
  };
}

/** Answers the current question correctly, or deliberately wrongly. */
function answer(session: Session, correct: boolean): Session {
  const question = currentQuestion(session)!;
  const chosen = correct
    ? question.correctIds[0]!
    : question.options!.find((id) => !question.correctIds.includes(id))!;
  return answerQuestion(session, chosen);
}

/** Plays a scripted run: `pattern[i]` says whether answer i is correct. */
function play(session: Session, pattern: boolean[]): Session {
  return pattern.reduce((current, correct) => answer(current, correct), session);
}

describe('streak bonus (§5.4)', () => {
  it('awards nothing below five in a row', () => {
    for (let streak = 0; streak < 5; streak++) expect(streakBonus(streak)).toBe(0);
  });

  it('awards one point per five consecutive correct answers', () => {
    expect(streakBonus(5)).toBe(1);
    expect(streakBonus(9)).toBe(1);
    expect(streakBonus(10)).toBe(2);
    expect(streakBonus(24)).toBe(4);
    expect(streakBonus(25)).toBe(5);
  });

  it('caps at five', () => {
    expect(streakBonus(30)).toBe(5);
    expect(streakBonus(500)).toBe(5);
  });

  it('is never negative', () => {
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(-3)).toBe(0);
  });
});

describe('question score (§5.4)', () => {
  const cases: Array<[Difficulty, number]> = [
    ['easy', 10],
    ['medium', 13],
    ['hard', 16],
    ['expert', 22],
  ];

  it.each(cases)('scores a correct %s answer at %i before any bonus', (difficulty, want) => {
    expect(questionScore(true, difficulty, 1)).toBe(want);
  });

  it('adds the streak bonus on top of the difficulty score', () => {
    expect(questionScore(true, 'hard', 5)).toBe(16 + 1);
    expect(questionScore(true, 'hard', 25)).toBe(16 + 5);
  });

  it('scores zero for a wrong answer regardless of streak', () => {
    expect(questionScore(false, 'expert', 20)).toBe(0);
  });
});

describe('session lifecycle', () => {
  it('starts empty and unfinished', () => {
    const session = createSession(config());
    expect(session.answers).toEqual([]);
    expect(session.currentIndex).toBe(0);
    expect(session.score).toBe(0);
    expect(isFinished(session)).toBe(false);
    expect(session.questions).toHaveLength(20);
  });

  it('does not mutate the session it is given', () => {
    const session = createSession(config());
    const snapshot = structuredClone(session);
    answer(session, true);
    expect(session).toEqual(snapshot);
  });

  it('advances one question per answer and finishes at the end', () => {
    let session = createSession(config({ length: 20 }));
    for (let i = 0; i < 20; i++) {
      expect(isFinished(session)).toBe(false);
      session = answer(session, true);
    }
    expect(isFinished(session)).toBe(true);
    expect(session.answers).toHaveLength(20);
    expect(session.finishedAt).not.toBeNull();
  });

  it('ignores further answers once finished', () => {
    let session = play(createSession(config({ length: 20 })), new Array(20).fill(true));
    const finished = session;
    session = answerQuestion(session, 'anything');
    expect(session).toBe(finished);
  });

  it('continues the run after a wrong answer (locked decision 1)', () => {
    let session = createSession(config({ length: 20 }));
    session = answer(session, false);
    expect(isFinished(session)).toBe(false);
    expect(session.currentIndex).toBe(1);
    expect(session.currentStreak).toBe(0);
  });

  it('records a skip as an incorrect answer without a choice', () => {
    const session = answerQuestion(createSession(config()), null);
    expect(session.answers[0]!.given).toBeNull();
    expect(session.answers[0]!.correct).toBe(false);
    expect(session.score).toBe(0);
  });

  it('captures no timing data anywhere (locked decision 5)', () => {
    const session = play(createSession(config({ length: 20 })), new Array(20).fill(true));
    const serialised = JSON.stringify(session);
    expect(serialised).not.toMatch(/duration|elapsed|timeTaken|msTaken/i);
    for (const recorded of session.answers) {
      expect(Object.keys(recorded).sort()).toEqual(['correct', 'given', 'questionId']);
    }
  });
});

describe('scripted 20-answer session (T1.3)', () => {
  /**
   * 20 questions on easy (10 points each). Twelve correct, arranged as a run
   * of 7, then a wrong answer, then a run of 5, then wrong, then 3 wrong.
   */
  const pattern = [
    true, true, true, true, true, true, true, // streak reaches 7
    false,
    true, true, true, true, true, // streak reaches 5
    false,
    false, false, false, false, false, false,
  ];

  it('has the shape the expectations below assume', () => {
    expect(pattern).toHaveLength(20);
    expect(pattern.filter(Boolean)).toHaveLength(12);
  });

  it('produces the expected score, streak and accuracy', () => {
    const session = play(createSession(config({ length: 20 })), pattern);

    // Base: 12 correct x 10 = 120.
    // Bonuses: the 5th, 6th and 7th of the first run earn +1 each (streak 5,6,7),
    // and the 5th of the second run earns +1. Total +4.
    expect(session.score).toBe(124);
    expect(session.longestStreak).toBe(7);
    expect(session.currentStreak).toBe(0);

    const result = summariseSession(session);
    expect(result.correctCount).toBe(12);
    expect(result.questionCount).toBe(20);
    expect(result.accuracy).toBeCloseTo(0.6, 5);
    expect(result.longestStreak).toBe(7);
  });

  it('scales the same run with difficulty', () => {
    const hard = play(createSession(config({ length: 20, difficulty: 'hard' })), pattern);
    // 12 x 16 = 192, plus the same +4 of streak bonus.
    expect(hard.score).toBe(196);
  });

  it('tracks the longest streak even when it is not the last one', () => {
    const session = play(
      createSession(config({ length: 20 })),
      [
        true, true, true, true, true, true, // 6
        false,
        true, true, // 2
        ...new Array(11).fill(false),
      ],
    );
    expect(session.longestStreak).toBe(6);
    expect(session.currentStreak).toBe(0);
  });

  it('counts a perfect run as one unbroken streak', () => {
    const session = play(createSession(config({ length: 20 })), new Array(20).fill(true));
    expect(session.longestStreak).toBe(20);
    // 20 x 10 = 200, plus bonuses from the 5th answer onwards:
    // streaks 5-9 -> +1 each (5), 10-14 -> +2 each (10), 15-19 -> +3 each (15),
    // 20 -> +4. Total bonus 34.
    expect(session.score).toBe(234);
    expect(summariseSession(session).accuracy).toBe(1);
  });
});

describe('grading', () => {
  it('marks the correct id correct and anything else wrong', () => {
    const session = createSession(config());
    const question = currentQuestion(session)!;
    const wrong = question.options!.find((id) => !question.correctIds.includes(id))!;

    expect(gradeChoice(question, question.correctIds[0]!).correct).toBe(true);
    expect(gradeChoice(question, wrong).correct).toBe(false);
    expect(gradeChoice(question, null).correct).toBe(false);
  });
});

describe('config signature (§2)', () => {
  it('separates runs that differ in any config dimension', () => {
    const base = config();
    const signatures = new Set([
      configSignature(base),
      configSignature(config({ difficulty: 'hard' })),
      configSignature(config({ length: 100 })),
      configSignature(config({ mode: 'capitals' })),
      configSignature(config({ direction: 'b-to-a' })),
      configSignature(config({ pool: { continents: ['Europe'], source: 'all', countrySet: 'all' } })),
      configSignature(config({ pool: { continents: 'all', source: 'hardest', countrySet: 'all' } })),
      configSignature(config({ pool: { continents: 'all', source: 'all', countrySet: 'un' } })),
    ]);
    expect(signatures.size).toBe(8);
  });

  /**
   * The three sets are three different tests: `un` drops the territories most
   * people have never heard of, and easy mode then biases what remains towards
   * familiar countries. A score on one must not displace a score on another.
   */
  it('separates the three country sets', () => {
    const signatures = new Set(
      (['un', 'un-plus-disputed', 'all'] as const).map((countrySet) =>
        configSignature(config({ pool: { continents: 'all', source: 'all', countrySet } })),
      ),
    );
    expect(signatures.size).toBe(3);
  });

  it('ignores the seed, so two runs of the same quiz compete for one high score', () => {
    expect(configSignature(config({ seed: 1 }))).toBe(configSignature(config({ seed: 2 })));
  });

  it('does not depend on the order continents were chosen in', () => {
    const a = configSignature(config({ pool: { continents: ['Europe', 'Asia'], source: 'all', countrySet: 'all' } }));
    const b = configSignature(config({ pool: { continents: ['Asia', 'Europe'], source: 'all', countrySet: 'all' } }));
    expect(a).toBe(b);
  });
});
