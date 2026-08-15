import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { PlayScreen } from './PlayScreen';
import { useSessionStore } from '@/store/sessionStore';
import { entities } from '@/data/entities.generated';
import { buildPool } from '@/engine/pool';
import { currentQuestion, type Session } from '@/engine/session';
import { generateQuestions } from '@/engine/questions';
import type { QuizConfig } from '@/engine/types';

const byId = new Map(entities.map((e) => [e.id, e]));

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'capitals',
    direction: 'a-to-b',
    difficulty: 'easy',
    length: 20,
    pool: { continents: 'all', source: 'all', countrySet: 'all' },
    seed: 31337,
    ...overrides,
  };
}

function startAndRender(overrides: Partial<QuizConfig> = {}) {
  let session!: Session;
  act(() => {
    session = useSessionStore.getState().start(config(overrides));
  });
  const router = createMemoryRouter(
    [
      { path: '/play/:mode', element: <PlayScreen /> },
      { path: '/results/:sessionId', element: <p>results</p> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: ['/play/capitals'] },
  );
  return { ...render(<RouterProvider router={router} />), session };
}

/**
 * Restarts the session until the current question is about `entityId`, so a
 * test can assert on a specific country without hard-coding a seed that would
 * silently stop meaning anything if the dataset changed.
 */
function startOn(entityId: string, overrides: Partial<QuizConfig> = {}) {
  for (let seed = 0; seed < 400; seed++) {
    const candidate = config({ ...overrides, seed });
    const { questions } = generateQuestions(candidate);
    const index = questions.findIndex((question) => question.entityId === entityId);
    if (index === -1) continue;

    act(() => {
      useSessionStore.getState().start(candidate);
    });
    // Skip forward to the question we want.
    for (let i = 0; i < index; i++) {
      act(() => {
        useSessionStore.getState().answer(null);
      });
    }
    const router = createMemoryRouter([{ path: '/play/:mode', element: <PlayScreen /> }], {
      initialEntries: ['/play/capitals'],
    });
    return render(<RouterProvider router={router} />);
  }
  throw new Error(`no seed produced a question for "${entityId}"`);
}

beforeEach(() => {
  useSessionStore.setState({ session: null, results: {} });
});

describe('capitals mode (T2.3)', () => {
  it('asks for the capital of a country', () => {
    startAndRender({ direction: 'a-to-b' });
    const question = currentQuestion(useSessionStore.getState().session!)!;
    expect(screen.getByText(/what is the capital of/i)).toBeInTheDocument();
    expect(screen.getByText(byId.get(question.entityId)!.name)).toBeInTheDocument();
  });

  it('asks which country has a capital in the other direction', () => {
    startAndRender({ direction: 'b-to-a' });
    expect(screen.getByText(/which country has this capital/i)).toBeInTheDocument();
  });

  it('offers capital names as the options', () => {
    startAndRender({ direction: 'a-to-b' });
    const question = currentQuestion(useSessionStore.getState().session!)!;
    const list = screen.getByRole('list');
    for (const id of question.options!) {
      const primary = byId.get(id)!.capitals.find((c) => c.isPrimary)!.name;
      expect(within(list).getByText(primary)).toBeInTheDocument();
    }
  });

  it('never puts Antarctica in a capitals pool (T2.3)', () => {
    const pool = buildPool(config({ mode: 'capitals' }));
    expect(pool.some((entity) => entity.id === 'antarctica')).toBe(false);
    // ...and not because of a hard-coded exclusion: it has no capital.
    expect(byId.get('antarctica')!.capitals).toEqual([]);
    // Every entity dropped from the pool was dropped for the same reason.
    const dropped = entities.filter((e) => !pool.some((p) => p.id === e.id));
    expect(dropped.every((e) => e.capitals.length === 0)).toBe(true);
  });

  it('never offers a country its own secondary capital as a distractor', () => {
    // South Africa's options must never include Cape Town or Bloemfontein.
    const { questions } = generateQuestions(config({ length: 'all', difficulty: 'hard' }));
    const southAfrica = questions.find((q) => q.entityId === 'south-africa')!;
    const labels = southAfrica.options!.map(
      (id) => byId.get(id)!.capitals.find((c) => c.isPrimary)!.name,
    );
    expect(labels).toContain('Pretoria');
    expect(labels).not.toContain('Cape Town');
    expect(labels).not.toContain('Bloemfontein');
  });
});

describe('expert difficulty (T2.4)', () => {
  it('offers a text box instead of options', () => {
    startAndRender({ difficulty: 'expert' });
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('accepts a correctly typed capital', async () => {
    const user = userEvent.setup();
    startAndRender({ difficulty: 'expert', direction: 'a-to-b' });
    const question = currentQuestion(useSessionStore.getState().session!)!;
    const capital = byId.get(question.entityId)!.capitals.find((c) => c.isPrimary)!.name;

    await user.type(screen.getByRole('combobox'), capital);
    await user.click(screen.getByRole('button', { name: /^answer$/i }));

    expect(screen.getByTestId('answer-announcement')).toHaveTextContent('Correct');
  });

  it('forgives a misspelling within tolerance', async () => {
    const user = userEvent.setup();
    startOn('burkina-faso', { difficulty: 'expert', direction: 'a-to-b' });

    await user.type(screen.getByRole('combobox'), 'Ouagadoudou');
    await user.click(screen.getByRole('button', { name: /^answer$/i }));

    expect(screen.getByTestId('answer-announcement')).toHaveTextContent('Correct');
  });

  /** The T2.3 acceptance criterion. */
  it.each(['Pretoria', 'Cape Town', 'Bloemfontein'])(
    'accepts "%s" for South Africa',
    async (typed) => {
      const user = userEvent.setup();
      startOn('south-africa', { difficulty: 'expert', direction: 'a-to-b' });

      await user.type(screen.getByRole('combobox'), typed);
      await user.click(screen.getByRole('button', { name: /^answer$/i }));

      expect(screen.getByTestId('answer-announcement')).toHaveTextContent('Correct');
    },
  );

  it('lists every accepted capital with its note after answering', async () => {
    const user = userEvent.setup();
    startOn('south-africa', { difficulty: 'expert', direction: 'a-to-b' });

    await user.type(screen.getByRole('combobox'), 'Pretoria');
    await user.click(screen.getByRole('button', { name: /^answer$/i }));

    expect(screen.getByText(/executive capital/i)).toBeInTheDocument();
    expect(screen.getByText(/legislative capital/i)).toBeInTheDocument();
    expect(screen.getByText(/judicial capital/i)).toBeInTheDocument();
  });

  it('rejects a different country and names the right answer', async () => {
    const user = userEvent.setup();
    startOn('austria', { difficulty: 'expert', direction: 'b-to-a' });

    await user.type(screen.getByRole('combobox'), 'Australia');
    await user.click(screen.getByRole('button', { name: /^answer$/i }));

    expect(screen.getByTestId('answer-announcement')).toHaveTextContent(
      'Incorrect, the answer was Austria',
    );
  });

  it('records a skip as an unanswered question', async () => {
    const user = userEvent.setup();
    startAndRender({ difficulty: 'expert' });
    await user.click(screen.getByRole('button', { name: /^skip$/i }));
    // Commit immediately rather than waiting out the 1.2s auto-advance.
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(useSessionStore.getState().session!.answers).toHaveLength(1);
    });
    expect(useSessionStore.getState().session!.answers[0]!.correct).toBe(false);
    expect(useSessionStore.getState().session!.answers[0]!.given).toBeNull();
  });

  it('always shows the flag and asks for the country in expert flags mode', () => {
    // "Country name → flag" has no free-text form, so the direction is forced.
    const { questions } = generateQuestions(
      config({ mode: 'flags', difficulty: 'expert', direction: 'b-to-a', length: 'all' }),
    );
    for (const question of questions) {
      expect(question.prompt.kind).toBe('flag');
      expect(question.answerKind).toBe('name');
      expect(question.options).toBeUndefined();
    }
  });
});

/**
 * R4. Skip and Answer shared one handler, so Skip graded whatever happened to
 * be in the box — two buttons doing different things under the same name.
 */
describe('skipping in expert mode', () => {
  it('gives up on the question even with a correct answer typed', async () => {
    const user = userEvent.setup();
    startOn('austria', { difficulty: 'expert', direction: 'b-to-a' });

    await user.type(screen.getByRole('combobox'), 'Austria');
    await user.click(screen.getByRole('button', { name: /^skip$/i }));

    // Skipped, not accepted: the typed text is not what was submitted.
    expect(screen.getByTestId('answer-announcement')).toHaveTextContent(
      'Incorrect, the answer was Austria',
    );
  });

  it('records nothing as the given answer, so review shows it as skipped', async () => {
    const user = userEvent.setup();
    startOn('austria', { difficulty: 'expert', direction: 'b-to-a' });

    await user.type(screen.getByRole('combobox'), 'Austr');
    await user.click(screen.getByRole('button', { name: /^skip$/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const answer = useSessionStore.getState().session!.answers[0]!;
    expect(answer.given).toBeNull();
    expect(answer.correct).toBe(false);
  });

  it('still answers with the typed text when Answer is used', async () => {
    const user = userEvent.setup();
    startOn('austria', { difficulty: 'expert', direction: 'b-to-a' });

    await user.type(screen.getByRole('combobox'), 'Austria');
    await user.click(screen.getByRole('button', { name: /^answer$/i }));

    expect(screen.getByTestId('answer-announcement')).toHaveTextContent('Correct');
  });
});
