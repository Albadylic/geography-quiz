import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ResultsScreen } from './ResultsScreen';
import { useSessionStore } from '@/store/sessionStore';
import { currentQuestion, type Session } from '@/engine/session';
import type { QuizConfig } from '@/engine/types';

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'flags',
    direction: 'a-to-b',
    difficulty: 'easy',
    length: 20,
    pool: { continents: 'all', source: 'all' },
    seed: 77,
    ...overrides,
  };
}

/** Plays a whole session through the store, answering per the pattern. */
function playThrough(pattern: (index: number) => boolean, overrides: Partial<QuizConfig> = {}) {
  let session!: Session;
  act(() => {
    session = useSessionStore.getState().start(config(overrides));
  });
  for (let i = 0; i < session.questions.length; i++) {
    const live = useSessionStore.getState().session!;
    const question = currentQuestion(live)!;
    const chosen = pattern(i)
      ? question.correctIds[0]!
      : question.options!.find((id) => !question.correctIds.includes(id))!;
    act(() => {
      useSessionStore.getState().answer(chosen);
    });
  }
  return session.id;
}

function renderResults(sessionId: string) {
  const router = createMemoryRouter(
    [
      { path: '/results/:sessionId', element: <ResultsScreen /> },
      { path: '/play/:mode/setup', element: <p>setup</p> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: [`/results/${sessionId}`] },
  );
  return render(<RouterProvider router={router} />);
}

/** Reads the <dd> that follows the <dt> carrying this label. */
const stat = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

beforeEach(() => {
  useSessionStore.setState({ session: null, results: {} });
});

describe('ResultsScreen', () => {
  it('reports score, accuracy, correct count and best streak', () => {
    // Every answer correct: 20 x 10 plus streak bonuses = 234 (see T1.3).
    const id = playThrough(() => true);
    renderResults(id);

    expect(stat('Score')).toBe('234');
    expect(stat('Accuracy')).toBe('100%');
    expect(stat('Correct')).toBe('20/20');
    expect(stat('Best streak')).toBe('20');
  });

  it('reports a mixed run accurately', () => {
    // First ten right, last ten wrong.
    const id = playThrough((index) => index < 10);
    renderResults(id);

    expect(stat('Accuracy')).toBe('50%');
    expect(stat('Correct')).toBe('10/20');
    expect(stat('Best streak')).toBe('10');
  });

  it('handles a run with nothing correct', () => {
    const id = playThrough(() => false);
    renderResults(id);

    expect(stat('Score')).toBe('0');
    expect(stat('Accuracy')).toBe('0%');
    expect(stat('Best streak')).toBe('0');
  });

  it('shows the config as a readable line (§9)', () => {
    const id = playThrough(() => true, {
      difficulty: 'hard',
      length: 20,
      pool: { continents: ['Europe'], source: 'all' },
    });
    renderResults(id);
    expect(screen.getByText(/flags · hard · 20 · Europe/i)).toBeInTheDocument();
  });

  it('offers a way to play again and to change mode', () => {
    const id = playThrough(() => true);
    renderResults(id);
    expect(screen.getByRole('link', { name: /play again/i })).toHaveAttribute(
      'href',
      '/play/flags/setup',
    );
    expect(screen.getByRole('link', { name: /choose another mode/i })).toBeInTheDocument();
  });

  it('explains itself when the result is not in memory', () => {
    renderResults('s-nonexistent');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/no such result/i);
    expect(screen.getByRole('link', { name: /back to the start/i })).toBeInTheDocument();
  });

  it('never implies a time component in the summary (locked decision 5)', () => {
    const id = playThrough(() => true);
    const { container } = renderResults(id);
    expect(container.textContent).not.toMatch(/time|seconds|minute|fast|speed|per second/i);
  });
});
