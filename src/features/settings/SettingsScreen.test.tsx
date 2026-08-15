import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SettingsScreen } from './SettingsScreen';
import { SetupScreen } from '@/features/setup/SetupScreen';
import { useStatsStore } from '@/store/statsStore';
import { useSessionStore } from '@/store/sessionStore';
import { recordOutcome } from '@/engine/stats';
import { entities } from '@/data/entities.generated';

function renderSettings() {
  const router = createMemoryRouter([{ path: '/settings', element: <SettingsScreen /> }], {
    initialEntries: ['/settings'],
  });
  return render(<RouterProvider router={router} />);
}

function renderSetup() {
  const router = createMemoryRouter(
    [
      { path: '/play/:mode/setup', element: <SetupScreen /> },
      { path: '/play/:mode', element: <p>playing</p> },
    ],
    { initialEntries: ['/play/flags/setup'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  useSessionStore.setState({ session: null, results: {} });
  act(() => {
    useStatsStore.getState().resetAll();
  });
});

describe('SettingsScreen', () => {
  it('offers the three country sets and the two toggles', () => {
    renderSettings();
    expect(screen.getByRole('radio', { name: /UN countries/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /plus disputed/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /everything/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /reduce motion/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /sound/i })).toBeInTheDocument();
  });

  it('defaults to UN countries rather than everything', () => {
    expect(useStatsStore.getState().data.settings.countrySet).toBe('un');
    renderSettings();
    expect(screen.getByRole('radio', { name: /UN countries/i })).toBeChecked();
  });

  it('persists the choice so it survives a reload', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('radio', { name: /everything/i }));
    expect(useStatsStore.getState().data.settings.countrySet).toBe('all');

    // Re-read from storage, as a fresh page load would.
    act(() => {
      useStatsStore.getState().reload();
    });
    expect(useStatsStore.getState().data.settings.countrySet).toBe('all');
  });

  /** §3.3: a filter on `status`, not a change to the data. */
  it('widens the quiz pool when the set is widened', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSetup();
    // The default set is UN countries.
    expect(screen.getByTestId('pool-summary')).toHaveTextContent('from 195 countries');
    unmount();

    renderSettings();
    await user.click(screen.getByRole('radio', { name: /everything/i }));

    renderSetup();
    expect(screen.getAllByTestId('pool-summary').at(-1)).toHaveTextContent(
      'from 250 countries',
    );
  });

  it('carries the default into the session it starts', async () => {
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole('button', { name: /start quiz/i }));

    const session = useSessionStore.getState().session!;
    expect(session.config.pool.countrySet).toBe('un');
    // No territory can appear, as a question or as a distractor.
    const ids = new Set(session.questions.flatMap((q) => [q.entityId, ...(q.options ?? [])]));
    for (const id of ids) {
      const entity = entities.find((candidate) => candidate.id === id)!;
      expect(['un-member', 'un-observer']).toContain(entity.status);
    }
  });

  it('shows the neutral About copy from §3.3', () => {
    renderSettings();
    expect(screen.getByText(/not a statement about sovereignty/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /about the country list/i })).toBeInTheDocument();
  });

  it('says where data is stored', () => {
    renderSettings();
    expect(screen.getByText(/stored on this device only/i)).toBeInTheDocument();
  });
});

describe('resetting data', () => {
  function seedSomeStats() {
    act(() => {
      const data = recordOutcome(useStatsStore.getState().data, 'france', 'flags', true, 1);
      useStatsStore.setState({ data });
    });
  }

  it('asks for confirmation before deleting anything', async () => {
    const user = userEvent.setup();
    seedSomeStats();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /reset all data/i }));

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    // Nothing deleted yet.
    expect(useStatsStore.getState().data.entityStats.france).toBeDefined();
  });

  it('keeps the data when the confirmation is declined', async () => {
    const user = userEvent.setup();
    seedSomeStats();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /reset all data/i }));
    await user.click(screen.getByRole('button', { name: /keep my data/i }));

    expect(useStatsStore.getState().data.entityStats.france).toBeDefined();
    expect(screen.queryByText(/cannot be undone/i)).toBeNull();
  });

  it('deletes everything once confirmed', async () => {
    const user = userEvent.setup();
    seedSomeStats();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /reset all data/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete everything/i }));

    expect(useStatsStore.getState().data.entityStats).toEqual({});
    expect(useStatsStore.getState().data.totals.questionsAnswered).toBe(0);

    // And it is gone from storage too, not just from memory.
    act(() => {
      useStatsStore.getState().reload();
    });
    expect(useStatsStore.getState().data.entityStats).toEqual({});
  });
});
