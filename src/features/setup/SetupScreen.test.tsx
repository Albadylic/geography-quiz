import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SetupScreen } from './SetupScreen';
import { useSessionStore } from '@/store/sessionStore';

function renderSetup(mode = 'flags') {
  const router = createMemoryRouter(
    [
      { path: '/play/:mode/setup', element: <SetupScreen /> },
      { path: '/play/:mode', element: <p>playing</p> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: [`/play/${mode}/setup`] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}

const poolSummary = () => screen.getByTestId('pool-summary');

beforeEach(() => {
  useSessionStore.setState({ session: null, results: {} });
});

describe('SetupScreen', () => {
  it('offers the four setup dimensions from §10', () => {
    renderSetup();
    expect(screen.getByRole('group', { name: /direction/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /difficulty/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /questions/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /continents/i })).toBeInTheDocument();
  });

  it('labels the directions in the language of the mode', () => {
    renderSetup('flags');
    expect(screen.getByRole('radio', { name: /flag → country/i })).toBeInTheDocument();

    renderSetup('capitals');
    expect(screen.getByRole('radio', { name: /country → capital/i })).toBeInTheDocument();
  });

  it('shows the real pool size before the user starts', () => {
    renderSetup();
    expect(poolSummary()).toHaveTextContent('20 questions from 250 countries');
  });

  /** The acceptance criterion for T1.4, in the plan's own words. */
  it('warns that 100 questions in Oceania will be capped, before starting', async () => {
    const user = userEvent.setup();
    renderSetup();

    await user.click(screen.getByRole('radio', { name: '100' }));
    const continents = screen.getByRole('group', { name: /continents/i });
    await user.click(within(continents).getByRole('checkbox', { name: 'Oceania' }));

    const summary = poolSummary();
    expect(summary).toHaveTextContent(/Oceania has \d+ countries/);
    expect(summary).toHaveTextContent(/this quiz will be \d+ questions/);
    // and the count is the real pool size, not a hard-coded number
    const poolSize = Number(/Oceania has (\d+)/.exec(summary.textContent!)![1]);
    expect(summary).toHaveTextContent(`this quiz will be ${poolSize} questions`);
    expect(poolSize).toBeLessThan(100);
  });

  it('does not warn when the pool is big enough', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('radio', { name: '50' }));
    expect(poolSummary()).toHaveTextContent('50 questions from 250 countries');
    expect(poolSummary()).not.toHaveTextContent(/this quiz will be/);
  });

  it('recomputes the pool when the continent selection changes', async () => {
    const user = userEvent.setup();
    renderSetup();
    const continents = screen.getByRole('group', { name: /continents/i });

    await user.click(within(continents).getByRole('checkbox', { name: 'South America' }));
    const southAmericaOnly = poolSummary().textContent!;

    await user.click(within(continents).getByRole('checkbox', { name: 'Africa' }));
    expect(poolSummary().textContent).not.toBe(southAmericaOnly);
  });

  it('counts a capitals pool differently from a flags pool', async () => {
    renderSetup('flags');
    expect(poolSummary()).toHaveTextContent('from 250 countries');

    // Entities with no capital drop out, so the capitals pool is smaller.
    renderSetup('capitals');
    const capitalsText = screen.getAllByTestId('pool-summary').at(-1)!.textContent!;
    const capitalsPool = Number(/from (\d+) countries/.exec(capitalsText)![1]);
    expect(capitalsPool).toBeLessThan(250);
  });

  it('starts a session with the chosen config and navigates to play', async () => {
    const user = userEvent.setup();
    const { router } = renderSetup();

    const difficulty = screen.getByRole('group', { name: /difficulty/i });
    await user.click(within(difficulty).getByRole('radio', { name: /hard/i }));
    await user.click(screen.getByRole('radio', { name: '50' }));
    await user.click(screen.getByRole('button', { name: /start quiz/i }));

    const session = useSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session!.config.difficulty).toBe('hard');
    expect(session!.config.length).toBe(50);
    expect(session!.questions).toHaveLength(50);
    expect(router.state.location.pathname).toBe('/play/flags');
  });

  it('gives each run a fresh seed', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('button', { name: /start quiz/i }));
    const first = useSessionStore.getState().session!.config.seed;

    renderSetup();
    await user.click(screen.getAllByRole('button', { name: /start quiz/i }).at(-1)!);
    const second = useSessionStore.getState().session!.config.seed;

    expect(first).not.toBe(second);
  });

  it('hides direction and difficulty for combo, which fixes both (§6.3)', () => {
    renderSetup('combo');
    expect(screen.queryByRole('group', { name: /difficulty/i })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /questions/i })).toBeInTheDocument();
  });

  it('explains itself for an unknown mode rather than crashing', () => {
    renderSetup('elevation');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/unknown mode/i);
  });
});
