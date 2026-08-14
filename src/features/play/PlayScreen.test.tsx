import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { PlayScreen } from './PlayScreen';
import { useSessionStore } from '@/store/sessionStore';
import { entities } from '@/data/entities.generated';
import { currentQuestion } from '@/engine/session';
import type { Difficulty, Direction, QuizConfig } from '@/engine/types';

const byId = new Map(entities.map((e) => [e.id, e]));

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'flags',
    direction: 'a-to-b',
    difficulty: 'easy',
    length: 20,
    pool: { continents: 'all', source: 'all' },
    seed: 4242,
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
      { path: '/results/:sessionId', element: <p>results screen</p> },
      { path: '/play/:mode/setup', element: <p>setup screen</p> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: ['/play/flags'] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}

const liveQuestion = () => currentQuestion(useSessionStore.getState().session!)!;

beforeEach(() => {
  useSessionStore.setState({ session: null, results: {} });
});

describe('PlayScreen without a session', () => {
  it('offers a way back rather than crashing', () => {
    const router = createMemoryRouter(
      [
        { path: '/play/:mode', element: <PlayScreen /> },
        { path: '/play/:mode/setup', element: <p>setup screen</p> },
      ],
      { initialEntries: ['/play/flags'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/no quiz running/i);
    expect(screen.getByRole('link', { name: /set up a quiz/i })).toBeInTheDocument();
  });
});

describe('PlayScreen — flag → country', () => {
  it('shows the flag with alt text that does not name the country (§11)', () => {
    startAndRender();
    const question = liveQuestion();
    const entity = byId.get(question.entityId)!;

    const prompt = screen.getByRole('img', { name: 'The flag in question' });
    expect(prompt).toBeInTheDocument();

    // No element anywhere on screen may name the answer while the question is open.
    expect(screen.queryByRole('img', { name: new RegExp(entity.name, 'i') })).toBeNull();
    expect(prompt).not.toHaveAttribute('title');
  });

  it('shows four options on easy, numbered for the keyboard', () => {
    startAndRender({ difficulty: 'easy' });
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('button')).toHaveLength(4);
    for (const digit of ['1', '2', '3', '4']) {
      expect(within(list).getByText(digit)).toBeInTheDocument();
    }
  });

  it.each<[Difficulty, number]>([
    ['easy', 4],
    ['medium', 6],
    ['hard', 8],
  ])('shows %s difficulty with %i options', (difficulty, count) => {
    startAndRender({ difficulty });
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(count);
  });

  it('marks a correct answer with an icon as well as colour (§10)', async () => {
    const user = userEvent.setup();
    startAndRender();
    const question = liveQuestion();

    const list = screen.getByRole('list');
    const buttons = within(list).getAllByRole('button');
    const correctIndex = question.options!.indexOf(question.correctIds[0]!);
    await user.click(buttons[correctIndex]!);

    expect(within(list).getByRole('img', { name: 'Correct' })).toBeInTheDocument();
    expect(within(list).queryByRole('img', { name: 'Incorrect' })).toBeNull();
  });

  it('reveals the right answer when the player gets it wrong (locked decision 2)', async () => {
    const user = userEvent.setup();
    startAndRender();
    const question = liveQuestion();

    const list = screen.getByRole('list');
    const buttons = within(list).getAllByRole('button');
    const wrongIndex = question.options!.findIndex(
      (id) => !question.correctIds.includes(id),
    );
    await user.click(buttons[wrongIndex]!);

    // Both marks are on screen: the cross on their pick, the tick on the answer.
    expect(within(list).getByRole('img', { name: 'Incorrect' })).toBeInTheDocument();
    expect(within(list).getByRole('img', { name: 'Correct' })).toBeInTheDocument();
  });

  it('names the country in the announcement when the answer was wrong (§11)', async () => {
    const user = userEvent.setup();
    startAndRender();
    const question = liveQuestion();
    const entity = byId.get(question.entityId)!;

    const buttons = within(screen.getByRole('list')).getAllByRole('button');
    const wrongIndex = question.options!.findIndex(
      (id) => !question.correctIds.includes(id),
    );
    await user.click(buttons[wrongIndex]!);

    expect(screen.getByTestId('answer-announcement')).toHaveTextContent(
      `Incorrect, the answer was ${entity.name}`,
    );
  });

  it('reveals the flag names only after grading', async () => {
    const user = userEvent.setup();
    startAndRender({ direction: 'b-to-a' }); // options are flags
    const question = liveQuestion();

    const list = screen.getByRole('list');
    // Before: every option flag is anonymous.
    expect(within(list).getAllByRole('img', { name: /^Flag option \d$/ })).toHaveLength(4);

    await user.click(within(list).getAllByRole('button')[0]!);

    // After: they are named.
    const named = question.options!.map((id) => byId.get(id)!.name);
    for (const name of named) {
      expect(within(list).getByRole('img', { name: `Flag of ${name}` })).toBeInTheDocument();
    }
  });

  it('ignores a second click while the answer is revealed', async () => {
    const user = userEvent.setup();
    startAndRender();
    const list = screen.getByRole('list');
    const buttons = within(list).getAllByRole('button');

    await user.click(buttons[0]!);
    await user.click(buttons[1]!);

    expect(useSessionStore.getState().session!.answers).toHaveLength(0);
    for (const button of within(list).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});

describe('keyboard play (§11)', () => {
  it('selects an option with the number keys', async () => {
    const user = userEvent.setup();
    startAndRender({ difficulty: 'hard' });
    const question = liveQuestion();
    const correctIndex = question.options!.indexOf(question.correctIds[0]!);

    await user.keyboard(String(correctIndex + 1));

    expect(
      within(screen.getByRole('list')).getByRole('img', { name: 'Correct' }),
    ).toBeInTheDocument();
  });

  it('ignores number keys beyond the option count', async () => {
    const user = userEvent.setup();
    startAndRender({ difficulty: 'easy' }); // 4 options
    await user.keyboard('7');
    expect(screen.getByTestId('answer-announcement')).toHaveTextContent('');
  });

  it('ignores number keys once the answer is revealed', async () => {
    const user = userEvent.setup();
    startAndRender({ difficulty: 'hard' });
    await user.keyboard('1');
    const announcement = screen.getByTestId('answer-announcement').textContent;
    await user.keyboard('2');
    expect(screen.getByTestId('answer-announcement').textContent).toBe(announcement);
  });
});

describe('advancing', () => {
  /**
   * Deliberately uses real timers. Driving this with `vi.useFakeTimers()`
   * plus userEvent's `advanceTimers` hangs, and because the hang happens while
   * fake timers are installed the `finally` that would restore them never
   * runs — which takes every later test in the file down with it. Waiting
   * 1.2s for real is slower but tests the behaviour that actually ships.
   */
  it('advances automatically after the reveal', async () => {
    const user = userEvent.setup();
    startAndRender();
    await user.click(within(screen.getByRole('list')).getAllByRole('button')[0]!);

    // Still on the question immediately after answering.
    expect(useSessionStore.getState().session!.answers).toHaveLength(0);

    await waitFor(
      () => {
        expect(useSessionStore.getState().session!.answers).toHaveLength(1);
      },
      { timeout: 4000 },
    );
    expect(useSessionStore.getState().session!.currentIndex).toBe(1);
  }, 10_000);

  it('advances immediately when Continue is pressed', async () => {
    const user = userEvent.setup();
    startAndRender();
    await user.click(within(screen.getByRole('list')).getAllByRole('button')[0]!);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(useSessionStore.getState().session!.currentIndex).toBe(1);
  });

  it('records exactly one answer per question, never two', async () => {
    const user = userEvent.setup();
    startAndRender();
    await user.click(within(screen.getByRole('list')).getAllByRole('button')[0]!);
    // Continue, then let any pending timer fire too.
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await new Promise((resolve) => setTimeout(resolve, 1400));

    expect(useSessionStore.getState().session!.answers).toHaveLength(1);
    expect(useSessionStore.getState().session!.currentIndex).toBe(1);
  }, 10_000);

  it('shows progress out of the total', () => {
    startAndRender({ length: 20 });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '20');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('navigates to the results screen when the run finishes', async () => {
    const user = userEvent.setup();
    const { router } = startAndRender({ length: 20 });

    for (let i = 0; i < 20; i++) {
      const list = screen.getByRole('list');
      await user.click(within(list).getAllByRole('button')[0]!);
      await user.click(screen.getByRole('button', { name: /continue/i }));
    }

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/results\//);
    });
  }, 30_000);
});

describe('name → flag direction', () => {
  it('prompts with the country name and offers flags', () => {
    startAndRender({ direction: 'b-to-a' as Direction });
    const question = liveQuestion();
    const entity = byId.get(question.entityId)!;
    expect(screen.getByText(entity.name)).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('img')).toHaveLength(4);
  });
});

describe('option grid never shows an unanswerable pair', () => {
  it('does not put two identical flags on screen at once', () => {
    // Runs the whole dataset through the screen's own rendering path.
    for (const seed of [1, 2, 3, 4, 5]) {
      act(() => {
        useSessionStore.getState().start(config({ seed, direction: 'b-to-a', difficulty: 'hard' }));
      });
      const session = useSessionStore.getState().session!;
      for (const question of session.questions) {
        const chosen = question.options!.map((id) => byId.get(id)!);
        for (const option of chosen) {
          for (const shared of option.flag.sharedWith ?? []) {
            expect(chosen.some((other) => other.id === shared)).toBe(false);
          }
        }
      }
    }
  });
});
