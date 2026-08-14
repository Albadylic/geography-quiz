import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RevisionScreen } from './RevisionScreen';
import { useStatsStore } from '@/store/statsStore';
import { recordOutcome } from '@/engine/stats';
import { entities } from '@/data/entities.generated';

function renderRevision() {
  const router = createMemoryRouter(
    [
      { path: '/revision', element: <RevisionScreen /> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: ['/revision'] },
  );
  return render(<RouterProvider router={router} />);
}

/** Enough history to unlock the hardest deck, with Chad clearly the weakest. */
function seedHistory() {
  act(() => {
    let data = useStatsStore.getState().data;
    for (let i = 0; i < 10; i++) data = recordOutcome(data, 'chad', 'flags', false, i);
    for (let i = 0; i < 15; i++) data = recordOutcome(data, 'france', 'flags', true, i);
    useStatsStore.setState({ data });
  });
}

beforeEach(() => {
  act(() => {
    useStatsStore.getState().resetAll();
  });
});

describe('deck picker (§6.4)', () => {
  it('offers a deck per continent', () => {
    renderRevision();
    for (const continent of ['Africa', 'Europe', 'Oceania', 'Antarctica']) {
      expect(screen.getByRole('button', { name: continent })).toBeInTheDocument();
    }
  });

  it('offers an untracked browse deck', () => {
    renderRevision();
    expect(screen.getByRole('button', { name: /just browse/i })).toBeInTheDocument();
  });

  it('locks the hardest deck until there is history to build it from', () => {
    renderRevision();
    expect(screen.getByRole('button', { name: /my hardest/i })).toBeDisabled();
    expect(screen.getByText(/play a few rounds first/i)).toBeInTheDocument();
  });

  it('unlocks the hardest deck once there is enough history', () => {
    seedHistory();
    renderRevision();
    expect(screen.getByRole('button', { name: /my hardest/i })).toBeEnabled();
  });
});

describe('flashcards', () => {
  async function openEuropeDeck() {
    const user = userEvent.setup();
    renderRevision();
    await user.click(screen.getByRole('button', { name: 'Europe' }));
    return user;
  }

  it('shows the country name first, with the answer hidden', async () => {
    await openEuropeDeck();
    // The front is just the name — no flag, no capital.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/tap to turn over/i)).toBeInTheDocument();
  });

  it('turns over to the flag, capital and continent', async () => {
    const user = await openEuropeDeck();
    await user.click(screen.getByText(/tap to turn over/i));

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText(/^Capital: /)).toBeInTheDocument();
    // Revision is the answer side, so the flag names itself.
    expect(screen.getByRole('img').getAttribute('alt')).toMatch(/^Flag of /);
  });

  it('offers both responses only once turned over', async () => {
    const user = await openEuropeDeck();
    expect(screen.queryByRole('button', { name: /knew it/i })).toBeNull();

    await user.click(screen.getByText(/tap to turn over/i));
    expect(screen.getByRole('button', { name: /^knew it$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /didn.t know it/i })).toBeInTheDocument();
  });

  it('advances to the next card and resets the flip', async () => {
    const user = await openEuropeDeck();
    const first = screen.getByRole('button', { name: /tap to turn over/i }).textContent;

    await user.click(screen.getByText(/tap to turn over/i));
    await user.click(screen.getByRole('button', { name: /^knew it$/i }));

    expect(screen.getByText(/tap to turn over/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /tap to turn over/i }).textContent,
    ).not.toBe(first);
  });

  it('has no score anywhere in the deck (§6.4)', async () => {
    const user = await openEuropeDeck();
    await user.click(screen.getByText(/tap to turn over/i));
    expect(screen.queryByText(/score/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/points|score/i);
  });
});

describe('Leitner tracking (T5.3 wired into T5.4)', () => {
  it('promotes a card the learner knew', async () => {
    const user = userEvent.setup();
    renderRevision();
    await user.click(screen.getByRole('button', { name: 'Europe' }));
    await user.click(screen.getByText(/tap to turn over/i));

    const shownName = screen.getByRole('img').getAttribute('alt')!.replace('Flag of ', '');
    const shown = entities.find((entity) => entity.name === shownName)!;
    await user.click(screen.getByRole('button', { name: /^knew it$/i }));

    const stats = useStatsStore.getState().data.entityStats;
    // The card that was on screen is the one promoted — asserting merely that
    // *something* reached box 2 passed even when the id was `undefined`.
    expect(Object.keys(stats)).toEqual([shown.id]);
    expect(stats[shown.id]!.leitnerBox).toBe(2);
  });

  it('keeps a card the learner missed in box 1', async () => {
    const user = userEvent.setup();
    renderRevision();
    await user.click(screen.getByRole('button', { name: 'Europe' }));
    await user.click(screen.getByText(/tap to turn over/i));
    await user.click(screen.getByRole('button', { name: /didn.t know it/i }));

    const stats = useStatsStore.getState().data.entityStats;
    expect(Object.keys(stats)).not.toContain('undefined');
    expect(Object.values(stats).every((stat) => stat.leitnerBox === 1)).toBe(true);
  });

  it('records nothing at all in the browse deck (§6.4)', async () => {
    const user = userEvent.setup();
    renderRevision();
    await user.click(screen.getByRole('button', { name: /just browse/i }));
    await user.click(screen.getByText(/tap to turn over/i));
    await user.click(screen.getByRole('button', { name: /^knew it$/i }));

    expect(useStatsStore.getState().data.entityStats).toEqual({});
    expect(screen.getByText(/nothing here is recorded/i)).toBeInTheDocument();
  });

  it('puts the least-known cards first', async () => {
    // Push France to a high box so Chad, still in box 1, must come first.
    act(() => {
      const data = useStatsStore.getState().data;
      useStatsStore.setState({
        data: {
          ...data,
          entityStats: {
            ...data.entityStats,
            france: {
              entityId: 'france',
              byMode: {
                flags: { correct: 5, wrong: 0, lastSeen: 1 },
                capitals: { correct: 0, wrong: 0, lastSeen: 0 },
              },
              leitnerBox: 5,
            },
          },
        },
      });
    });

    const user = userEvent.setup();
    renderRevision();
    await user.click(screen.getByRole('button', { name: 'Europe' }));

    // France is in box 5, so it cannot be the first card of a Europe deck.
    expect(screen.getByRole('button', { name: /tap to turn over/i }).textContent).not.toMatch(
      /^France/,
    );
  });
});

describe('finishing a deck', () => {
  it('reports how many were known, with no score', async () => {
    const user = userEvent.setup();
    renderRevision();
    // Antarctica is the smallest deck, so it finishes quickly.
    await user.click(screen.getByRole('button', { name: 'Antarctica' }));

    for (let i = 0; i < 10; i++) {
      const front = screen.queryByText(/tap to turn over/i);
      if (!front) break;
      await user.click(front);
      await user.click(screen.getByRole('button', { name: /^knew it$/i }));
    }

    expect(screen.getByRole('heading', { name: /deck finished/i })).toBeInTheDocument();
    expect(screen.getByText(/you knew \d+ of \d+/i)).toBeInTheDocument();
  }, 30_000);
});
