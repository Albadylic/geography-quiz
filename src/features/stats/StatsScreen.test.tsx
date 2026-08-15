import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { StatsScreen } from './StatsScreen';
import { useStatsStore } from '@/store/statsStore';
import { useSessionStore } from '@/store/sessionStore';
import { answerQuestion, createSession, summariseSession, type Session } from '@/engine/session';
import { recordOutcome, recordSession, HARDEST_UNLOCK_THRESHOLD } from '@/engine/stats';
import type { QuizConfig } from '@/engine/types';

function renderStats() {
  const router = createMemoryRouter(
    [
      { path: '/stats', element: <StatsScreen /> },
      { path: '/', element: <p>home</p> },
      { path: '/settings', element: <p>settings</p> },
      { path: '/play/:mode/setup', element: <p>setup</p> },
    ],
    { initialEntries: ['/stats'] },
  );
  return render(<RouterProvider router={router} />);
}

const stat = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'flags',
    direction: 'a-to-b',
    difficulty: 'easy',
    length: 20,
    pool: { continents: 'all', source: 'all', countrySet: 'all' },
    seed: 909,
    ...overrides,
  };
}

/** Plays a full session and commits it to the stats store. */
function playAndRecord(correctAt: (index: number) => boolean, overrides: Partial<QuizConfig> = {}) {
  let session: Session = createSession(config(overrides));
  const questions = session.questions;
  for (let i = 0; i < questions.length; i++) {
    const question = session.questions[session.currentIndex]!;
    const chosen = correctAt(i)
      ? question.correctIds[0]!
      : question.options!.find((id) => !question.correctIds.includes(id))!;
    session = answerQuestion(session, chosen);
  }
  act(() => {
    const data = recordSession(useStatsStore.getState().data, summariseSession(session), questions);
    useStatsStore.setState({ data });
  });
  return session;
}

beforeEach(() => {
  useSessionStore.setState({ session: null, results: {} });
  act(() => {
    useStatsStore.getState().resetAll();
  });
});

describe('StatsScreen with no history', () => {
  it('says so rather than showing zeroes everywhere', () => {
    renderStats();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/no stats yet/i);
    expect(screen.getByRole('link', { name: /play a round/i })).toBeInTheDocument();
  });
});

describe('StatsScreen totals (§9)', () => {
  it('reports questions answered, accuracy and mastered count', () => {
    playAndRecord(() => true);
    renderStats();

    expect(stat('Questions')).toBe('20');
    expect(stat('Accuracy')).toBe('100%');
    // Mastery needs 3 correct answers on the same country; one run of 20
    // distinct countries gives each of them exactly one.
    expect(stat('Mastered')).toBe('0');
  });

  it('counts a country as mastered after enough correct answers', () => {
    act(() => {
      let data = useStatsStore.getState().data;
      for (let i = 0; i < 3; i++) data = recordOutcome(data, 'france', 'flags', true, i);
      useStatsStore.setState({ data });
    });
    renderStats();
    expect(stat('Mastered')).toBe('1');
  });

  it('reports accuracy across a mixed run', () => {
    playAndRecord((index) => index < 10);
    renderStats();
    expect(stat('Accuracy')).toBe('50%');
  });
});

describe('streaks (§9)', () => {
  it('shows the longest streak globally and per mode', () => {
    playAndRecord(() => true);
    renderStats();

    expect(stat('Longest streak')).toBe('20');
    expect(stat('Flags')).toBe('20');
    expect(stat('Capitals')).toBe('0');
  });

  it('carries a streak across two sessions', () => {
    playAndRecord(() => true, { seed: 1 });
    playAndRecord(() => true, { seed: 2 });
    renderStats();
    expect(stat('Longest streak')).toBe('40');
  });
});

describe('high scores (§9)', () => {
  it('shows the config signature as a readable line', () => {
    playAndRecord(() => true, { difficulty: 'hard', pool: { continents: ['Europe'], source: 'all', countrySet: 'all' } });
    renderStats();

    const scores = screen.getByRole('heading', { name: /high scores/i }).parentElement!;
    expect(within(scores).getByText(/flags · hard · 20 · Europe/i)).toBeInTheDocument();
  });

  it('keeps separate entries for configs that differ', () => {
    playAndRecord(() => true, { difficulty: 'easy', seed: 1 });
    playAndRecord(() => true, { difficulty: 'hard', seed: 2 });
    renderStats();

    const scores = screen.getByRole('heading', { name: /high scores/i }).parentElement!;
    expect(within(scores).getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps one entry when the same config is played twice', () => {
    playAndRecord(() => true, { seed: 1 });
    playAndRecord((index) => index < 5, { seed: 2 });
    renderStats();

    const scores = screen.getByRole('heading', { name: /high scores/i }).parentElement!;
    expect(within(scores).getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('weakest 20 (§9)', () => {
  it('lists the countries most often got wrong', () => {
    act(() => {
      let data = useStatsStore.getState().data;
      for (let i = 0; i < 5; i++) data = recordOutcome(data, 'chad', 'flags', false, i);
      for (let i = 0; i < 5; i++) data = recordOutcome(data, 'france', 'flags', true, i);
      useStatsStore.setState({ data });
    });
    renderStats();

    const weakest = screen.getByRole('heading', { name: /weakest 20/i }).parentElement!;
    const rows = within(weakest).getAllByRole('listitem');
    // The 0/5 country ranks above the 5/5 one.
    expect(rows[0]!.textContent).toMatch(/Chad/);
    expect(rows[0]!.textContent).toMatch(/0\/5 right/);
  });

  it('shows at most twenty', () => {
    act(() => {
      let data = useStatsStore.getState().data;
      for (let i = 0; i < 30; i++) {
        data = recordOutcome(data, `country-${i}`, 'flags', false, i);
      }
      useStatsStore.setState({ data });
    });
    renderStats();

    const weakest = screen.getByRole('heading', { name: /weakest 20/i }).parentElement!;
    expect(within(weakest).getAllByRole('listitem')).toHaveLength(20);
  });

  /** §8: Hardest stays locked until there is enough evidence to use it. */
  it('locks the Hardest link with the plan copy below the threshold', () => {
    act(() => {
      let data = useStatsStore.getState().data;
      for (let i = 0; i < 5; i++) data = recordOutcome(data, 'chad', 'flags', false, i);
      useStatsStore.setState({ data });
    });
    renderStats();

    expect(screen.getByText(/play a few rounds first/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`5/${HARDEST_UNLOCK_THRESHOLD}`))).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /practise these/i })).toBeNull();
  });

  it('unlocks the Hardest link once there is enough history', () => {
    playAndRecord(() => false);
    renderStats();

    expect(screen.getByRole('link', { name: /practise these/i })).toBeInTheDocument();
    expect(screen.queryByText(/play a few rounds first/i)).toBeNull();
  });
});
