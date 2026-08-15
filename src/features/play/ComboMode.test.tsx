import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { PlayScreen } from './PlayScreen';
import { useSessionStore } from '@/store/sessionStore';
import { useStatsStore } from '@/store/statsStore';
import { entities } from '@/data/entities.generated';
import { generateQuestions, COMBO_OPTION_COUNT } from '@/engine/questions';
import { gradeCombo } from '@/engine/grading';
import { creditFor, currentQuestion, scoreForCredit } from '@/engine/session';
import { outcomesFor } from '@/engine/stats';
import type { QuizConfig } from '@/engine/types';

const byId = new Map(entities.map((e) => [e.id, e]));

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'combo',
    direction: 'a-to-b',
    difficulty: 'medium',
    length: 20,
    pool: { continents: 'all', source: 'all', countrySet: 'all' },
    seed: 6161,
    ...overrides,
  };
}

function startAndRender(overrides: Partial<QuizConfig> = {}) {
  act(() => {
    useSessionStore.getState().start(config(overrides));
  });
  const router = createMemoryRouter(
    [
      { path: '/play/:mode', element: <PlayScreen /> },
      { path: '/results/:sessionId', element: <p>results</p> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: ['/play/combo'] },
  );
  return render(<RouterProvider router={router} />);
}

const flagGrid = () => screen.getByRole('list', { name: /flag options/i });
const capitalGrid = () => screen.getByRole('list', { name: /capital options/i });
const liveQuestion = () => currentQuestion(useSessionStore.getState().session!)!;

/** Clicks the correct or an incorrect option in one of the two grids. */
async function pick(
  user: ReturnType<typeof userEvent.setup>,
  grid: HTMLElement,
  optionIds: string[],
  correctId: string,
  wantCorrect: boolean,
) {
  const index = wantCorrect
    ? optionIds.indexOf(correctId)
    : optionIds.findIndex((id) => id !== correctId);
  await user.click(within(grid).getAllByRole('button')[index]!);
}

beforeEach(() => {
  useSessionStore.setState({ session: null, results: {} });
  act(() => {
    useStatsStore.getState().resetAll();
  });
});

describe('combo question generation (T4.1)', () => {
  it('gives every question two halves, one per stat mode', () => {
    const { questions } = generateQuestions(config({ length: 20 }));
    for (const question of questions) {
      expect(question.halves).toHaveLength(2);
      expect(question.halves!.map((h) => h.statMode)).toEqual(['flags', 'capitals']);
    }
  });

  it('fixes both groups at four options (§6.3)', () => {
    const { questions } = generateQuestions(config({ length: 20 }));
    for (const question of questions) {
      for (const half of question.halves!) {
        expect(half.options).toHaveLength(COMBO_OPTION_COUNT);
      }
    }
  });

  it('puts exactly one correct option in each half', () => {
    const { questions } = generateQuestions(config({ length: 50 }));
    for (const question of questions) {
      for (const half of question.halves!) {
        const correct = half.options.filter((id) => half.correctIds.includes(id));
        expect(correct, `${question.id} ${half.statMode}`).toHaveLength(1);
      }
    }
  });

  it('only draws countries that have a capital', () => {
    const { questions } = generateQuestions(config({ length: 'all' }));
    for (const question of questions) {
      expect(byId.get(question.entityId)!.capitals.length).toBeGreaterThan(0);
    }
  });

  it('never puts two identical flags in the flag half', () => {
    const { questions } = generateQuestions(config({ length: 'all' }));
    for (const question of questions) {
      const flagHalf = question.halves!.find((h) => h.statMode === 'flags')!;
      const chosen = flagHalf.options.map((id) => byId.get(id)!);
      for (const option of chosen) {
        for (const shared of option.flag.sharedWith ?? []) {
          expect(chosen.some((other) => other.id === shared)).toBe(false);
        }
      }
    }
  });

  it('is reproducible for a seed', () => {
    expect(generateQuestions(config({ seed: 5 }))).toEqual(generateQuestions(config({ seed: 5 })));
  });
});

describe('combo grading (T4.1)', () => {
  const question = generateQuestions(config({ length: 20 })).questions[0]!;
  const entityId = question.entityId;
  const wrongId = question
    .halves!.find((h) => h.statMode === 'flags')!
    .options.find((id) => id !== entityId)!;

  it('marks both halves right as fully correct', () => {
    const answer = gradeCombo(question, { flags: entityId, capitals: entityId });
    expect(answer.correct).toBe(true);
    expect(answer.halfResults).toEqual({ flags: true, capitals: true });
    expect(creditFor(answer)).toBe(1);
  });

  it('marks a half-right answer as not correct, but worth half', () => {
    const answer = gradeCombo(question, { flags: entityId, capitals: wrongId });
    expect(answer.correct).toBe(false);
    expect(answer.halfResults).toEqual({ flags: true, capitals: false });
    expect(creditFor(answer)).toBe(0.5);
  });

  it('marks both halves wrong as no credit', () => {
    const answer = gradeCombo(question, { flags: wrongId, capitals: wrongId });
    expect(creditFor(answer)).toBe(0);
  });

  it('treats an unanswered half as wrong', () => {
    const answer = gradeCombo(question, { flags: entityId });
    expect(answer.halfResults).toEqual({ flags: true, capitals: false });
  });

  it('remembers what was picked in each half, for the review list', () => {
    const answer = gradeCombo(question, { flags: entityId, capitals: wrongId });
    expect(answer.halfGiven).toEqual({ flags: entityId, capitals: wrongId });
  });
});

describe('combo scoring — half right earns half (§6.3)', () => {
  it('scores a fully correct answer at the full rate', () => {
    // medium multiplier 1.3 -> round(10 * 1.3) = 13
    expect(scoreForCredit(1, 'medium', 1)).toBe(13);
  });

  it('scores a half-right answer at half', () => {
    // round(10 * 1.3 * 0.5) = round(6.5) = 7
    expect(scoreForCredit(0.5, 'medium', 1)).toBe(7);
  });

  it('scores nothing for both halves wrong', () => {
    expect(scoreForCredit(0, 'medium', 5)).toBe(0);
  });

  it('withholds the streak bonus from a half-right answer', () => {
    // A full answer at streak 5 earns the +1; a half answer does not.
    expect(scoreForCredit(1, 'medium', 5)).toBe(13 + 1);
    expect(scoreForCredit(0.5, 'medium', 5)).toBe(7);
  });
});

describe('combo records two per-entity outcomes (locked decision 3)', () => {
  it('splits a half-right answer into one right and one wrong', () => {
    const question = generateQuestions(config({ length: 20 })).questions[0]!;
    const wrongId = question
      .halves!.find((h) => h.statMode === 'capitals')!
      .options.find((id) => id !== question.entityId)!;

    const answer = gradeCombo(question, {
      flags: question.entityId,
      capitals: wrongId,
    });

    expect(outcomesFor(question, answer)).toEqual([
      { entityId: question.entityId, mode: 'flags', correct: true },
      { entityId: question.entityId, mode: 'capitals', correct: false },
    ]);
  });

  it('writes both outcomes to the stats store when the session finishes', async () => {
    const user = userEvent.setup();
    startAndRender({ length: 20 });

    for (let i = 0; i < 20; i++) {
      const question = liveQuestion();
      const flags = question.halves!.find((h) => h.statMode === 'flags')!;
      const capitals = question.halves!.find((h) => h.statMode === 'capitals')!;

      // Flag right, capital wrong, every time.
      await pick(user, flagGrid(), flags.options, question.entityId, true);
      await pick(user, capitalGrid(), capitals.options, question.entityId, false);
      await user.click(screen.getByRole('button', { name: /check both answers/i }));
      await user.click(screen.getByRole('button', { name: /continue/i }));
    }

    const data = useStatsStore.getState().data;
    // 20 questions, two outcomes each.
    expect(data.totals.questionsAnswered).toBe(40);
    expect(data.totals.correctAnswers).toBe(20);

    for (const [, stat] of Object.entries(data.entityStats)) {
      expect(stat.byMode.flags.correct).toBe(1);
      expect(stat.byMode.capitals.wrong).toBe(1);
    }
  }, 60_000);
});

describe('combo UI (T4.2)', () => {
  it('shows one country prompt and two option groups', () => {
    startAndRender();
    const question = liveQuestion();
    expect(screen.getByText(byId.get(question.entityId)!.name)).toBeInTheDocument();
    expect(flagGrid()).toBeInTheDocument();
    expect(capitalGrid()).toBeInTheDocument();
  });

  it('requires both halves before it will check the answer', async () => {
    const user = userEvent.setup();
    startAndRender();
    const question = liveQuestion();

    const submit = () => screen.getByRole('button', { name: /choose a flag and a capital|check both answers/i });
    expect(submit()).toBeDisabled();

    const flags = question.halves!.find((h) => h.statMode === 'flags')!;
    await pick(user, flagGrid(), flags.options, question.entityId, true);
    expect(submit()).toBeDisabled();

    const capitals = question.halves!.find((h) => h.statMode === 'capitals')!;
    await pick(user, capitalGrid(), capitals.options, question.entityId, true);
    expect(submit()).toBeEnabled();
  });

  it('lets the player change a choice before checking', async () => {
    const user = userEvent.setup();
    startAndRender();
    const question = liveQuestion();
    const flags = question.halves!.find((h) => h.statMode === 'flags')!;

    await pick(user, flagGrid(), flags.options, question.entityId, false);
    await pick(user, flagGrid(), flags.options, question.entityId, true);

    // Nothing is graded until Check, so no answer has been recorded.
    expect(useSessionStore.getState().session!.answers).toHaveLength(0);
  });

  it('marks each half separately once checked', async () => {
    const user = userEvent.setup();
    startAndRender();
    const question = liveQuestion();
    const flags = question.halves!.find((h) => h.statMode === 'flags')!;
    const capitals = question.halves!.find((h) => h.statMode === 'capitals')!;

    await pick(user, flagGrid(), flags.options, question.entityId, true);
    await pick(user, capitalGrid(), capitals.options, question.entityId, false);
    await user.click(screen.getByRole('button', { name: /check both answers/i }));

    // The flag half shows only a tick; the capital half shows both marks.
    expect(within(flagGrid()).getByRole('img', { name: 'Correct' })).toBeInTheDocument();
    expect(within(flagGrid()).queryByRole('img', { name: 'Incorrect' })).toBeNull();
    expect(within(capitalGrid()).getByRole('img', { name: 'Incorrect' })).toBeInTheDocument();
    expect(within(capitalGrid()).getByRole('img', { name: 'Correct' })).toBeInTheDocument();
  });

  it('announces which half was wrong, not just that something was (§11)', async () => {
    const user = userEvent.setup();
    startAndRender();
    const question = liveQuestion();
    const entity = byId.get(question.entityId)!;
    const flags = question.halves!.find((h) => h.statMode === 'flags')!;
    const capitals = question.halves!.find((h) => h.statMode === 'capitals')!;

    await pick(user, flagGrid(), flags.options, question.entityId, true);
    await pick(user, capitalGrid(), capitals.options, question.entityId, false);
    await user.click(screen.getByRole('button', { name: /check both answers/i }));

    expect(screen.getByTestId('answer-announcement')).toHaveTextContent(
      `${entity.name}: flag correct, capital incorrect`,
    );
  });

  it('does not offer number-key shortcuts, which would be ambiguous', () => {
    startAndRender();
    // The numbered badges are absent when two grids share the screen.
    expect(within(flagGrid()).queryByText('1')).toBeNull();
  });

  it('gets its own high score entry (§15.3)', async () => {
    const user = userEvent.setup();
    startAndRender({ length: 20 });

    for (let i = 0; i < 20; i++) {
      const question = liveQuestion();
      const flags = question.halves!.find((h) => h.statMode === 'flags')!;
      const capitals = question.halves!.find((h) => h.statMode === 'capitals')!;
      await pick(user, flagGrid(), flags.options, question.entityId, true);
      await pick(user, capitalGrid(), capitals.options, question.entityId, true);
      await user.click(screen.getByRole('button', { name: /check both answers/i }));
      await user.click(screen.getByRole('button', { name: /continue/i }));
    }

    const signatures = Object.keys(useStatsStore.getState().data.highScores);
    expect(signatures).toHaveLength(1);
    expect(signatures[0]).toMatch(/^combo\|/);
    // ...and combo keeps its own streak bucket, separate from flags/capitals.
    expect(useStatsStore.getState().data.streaks.combo?.longest).toBe(20);
    expect(useStatsStore.getState().data.streaks.flags).toBeUndefined();
  }, 60_000);
});
