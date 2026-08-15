import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ColourScreen } from './ColourScreen';
import { entities } from '@/data/entities.generated';
import { templateById } from '@/data/flag-templates';
import { COLOUR_NAMES } from '@/engine/colour';
import * as rng from '@/engine/rng';
import type { ColourToken } from '@/data/schema';

function renderColour() {
  const router = createMemoryRouter(
    [
      { path: '/play/colour/setup', element: <ColourScreen /> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: ['/play/colour/setup'] },
  );
  return render(<RouterProvider router={router} />);
}

async function startEasyRound() {
  const user = userEvent.setup();
  renderColour();
  await user.click(screen.getByRole('button', { name: /easy/i }));
  return user;
}

const flag = () => screen.getByRole('img', { name: /blank flag of/i });
const regions = () => within(flag()).getAllByRole('button');
const swatch = (name: RegExp) => screen.getByRole('button', { name });

describe('setup', () => {
  it('offers the three palette difficulties (§7)', () => {
    renderColour();
    expect(screen.getByRole('button', { name: /easy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hard/i })).toBeInTheDocument();
  });

  it('says how many flags are available', () => {
    renderColour();
    expect(screen.getByText(/\d+ flags are available/)).toBeInTheDocument();
  });
});

describe('painting (T6.3)', () => {
  it('shows a blank flag with one clickable region per template region', async () => {
    await startEasyRound();
    expect(flag()).toBeInTheDocument();
    expect(regions().length).toBeGreaterThanOrEqual(2);
  });

  it('gives every swatch a visible colour name, not just a chip (§7)', async () => {
    await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    for (const button of within(palette).getAllByRole('button')) {
      expect(button.textContent!.trim().length).toBeGreaterThan(0);
    }
  });

  it('fills a region with the selected colour', async () => {
    const user = await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    const firstColour = within(palette).getAllByRole('button')[0]!;
    const colourName = firstColour.textContent!.trim();

    await user.click(firstColour);
    await user.click(regions()[0]!);

    expect(regions()[0]!.getAttribute('aria-label')).toContain(colourName);
  });

  it('does nothing when no colour is selected', async () => {
    const user = await startEasyRound();
    const before = regions()[0]!.getAttribute('aria-label');
    await user.click(regions()[0]!);
    expect(regions()[0]!.getAttribute('aria-label')).toBe(before);
  });

  it('erases a single region without touching the others', async () => {
    const user = await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    await user.click(within(palette).getAllByRole('button')[0]!);
    await user.click(regions()[0]!);
    await user.click(regions()[1]!);

    await user.click(swatch(/^eraser$/i));
    await user.click(regions()[0]!);

    expect(regions()[0]!.getAttribute('aria-label')).toContain('not filled');
    expect(regions()[1]!.getAttribute('aria-label')).not.toContain('not filled');
  });

  it('clears every region at once', async () => {
    const user = await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    await user.click(within(palette).getAllByRole('button')[0]!);
    for (const region of regions()) await user.click(region);

    await user.click(screen.getByRole('button', { name: /clear all/i }));

    for (const region of regions()) {
      expect(region.getAttribute('aria-label')).toContain('not filled');
    }
  });

  it('undoes and redoes a fill', async () => {
    const user = await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    await user.click(within(palette).getAllByRole('button')[0]!);
    await user.click(regions()[0]!);
    const filledLabel = regions()[0]!.getAttribute('aria-label');

    await user.click(screen.getByRole('button', { name: /^undo$/i }));
    expect(regions()[0]!.getAttribute('aria-label')).toContain('not filled');

    await user.click(screen.getByRole('button', { name: /^redo$/i }));
    expect(regions()[0]!.getAttribute('aria-label')).toBe(filledLabel);
  });

  it('disables undo with nothing to undo, and redo with nothing to redo', async () => {
    await startEasyRound();
    expect(screen.getByRole('button', { name: /^undo$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^redo$/i })).toBeDisabled();
  });

  it('paints from the keyboard as well as the pointer (§11)', async () => {
    const user = await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    await user.click(within(palette).getAllByRole('button')[0]!);

    regions()[0]!.focus();
    await user.keyboard('{Enter}');
    expect(regions()[0]!.getAttribute('aria-label')).not.toContain('not filled');
  });

  it('will not check until every region is filled', async () => {
    const user = await startEasyRound();
    expect(screen.getByRole('button', { name: /fill every region first/i })).toBeDisabled();

    const palette = screen.getByRole('group', { name: /colours/i });
    await user.click(within(palette).getAllByRole('button')[0]!);
    for (const region of regions()) await user.click(region);

    expect(screen.getByRole('button', { name: /check my flag/i })).toBeEnabled();
  });
});

describe('grading and the summary (T6.4)', () => {
  /**
   * Fills every region with its correct colour, looked up from the dataset for
   * whichever country is on screen. Guessing by clicking every swatch at every
   * region does not work — each region simply keeps the last colour applied.
   */
  async function fillCorrectly(user: ReturnType<typeof userEvent.setup>) {
    const name = screen.getByRole('heading', { level: 1 }).textContent!;
    const shown = entities.find((candidate) => candidate.name === name)!;
    const template = templateById(shown.colouring!.templateId)!;

    const painted = regions();
    for (const [index, region] of template.regions.entries()) {
      const token = shown.colouring!.regions[region.id] as ColourToken;
      await user.click(screen.getByRole('button', { name: COLOUR_NAMES[token] }));
      await user.click(painted[index]!);
    }
  }

  it('reports per-region results with the real flag alongside (§7)', async () => {
    const user = await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    await user.click(within(palette).getAllByRole('button')[0]!);
    for (const region of regions()) await user.click(region);
    await user.click(screen.getByRole('button', { name: /check my flag/i }));

    expect(screen.getByText(/the real flag/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Flag of / })).toBeInTheDocument();

    // One summary row per region, each naming the expected colour.
    const summary = screen.getAllByRole('list').at(-1)!;
    expect(within(summary).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
  });

  it('tells the player what they said when a region is wrong', async () => {
    const user = await startEasyRound();
    const palette = screen.getByRole('group', { name: /colours/i });
    const swatches = within(palette)
      .getAllByRole('button')
      .filter((button) => !/eraser/i.test(button.textContent ?? ''));

    // Paint every region the same colour, so at least one must be wrong.
    await user.click(swatches[0]!);
    for (const region of regions()) await user.click(region);
    await user.click(screen.getByRole('button', { name: /check my flag/i }));

    // More than one region can be wrong, so there may be several of these.
    expect(screen.getAllByText(/you said/i).length).toBeGreaterThan(0);
  });

  it('recognises a fully correct flag', async () => {
    const user = await startEasyRound();
    await fillCorrectly(user);
    await user.click(screen.getByRole('button', { name: /check my flag/i }));
    expect(screen.getByRole('heading', { name: /exactly right/i })).toBeInTheDocument();
  }, 30_000);

  it('moves on to the next flag', async () => {
    const user = await startEasyRound();
    const firstName = screen.getByRole('heading', { level: 1 }).textContent;

    const palette = screen.getByRole('group', { name: /colours/i });
    await user.click(within(palette).getAllByRole('button')[0]!);
    for (const region of regions()) await user.click(region);
    await user.click(screen.getByRole('button', { name: /check my flag/i }));
    await user.click(screen.getByRole('button', { name: /next flag/i }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(firstName);
    // The new flag starts blank.
    for (const region of regions()) {
      expect(region.getAttribute('aria-label')).toContain('not filled');
    }
  });
});

/**
 * Emblems — follow-up F4. Seeded so the first flag is one that has an emblem;
 * the seed is pinned rather than left to chance because only 16 of the 88
 * colourable flags carry one.
 */
describe('flag decorations', () => {
  async function startDecoratedRound() {
    vi.spyOn(rng, 'randomSeed').mockReturnValue(8);
    return startEasyRound();
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws the emblem without adding a region to paint', async () => {
    await startDecoratedRound();
    const emblems = flag().querySelector('[data-decorations]')!;

    expect(emblems).not.toBeNull();
    expect(emblems.querySelectorAll('path').length).toBeGreaterThan(0);
    // The emblem adds neither a region to paint nor a clickable anything.
    expect(regions()).toHaveLength(templateById('horizontal-3')!.regions.length);
    expect(within(emblems as HTMLElement).queryAllByRole('button')).toHaveLength(0);
  });

  it('is scenery: hidden from screen readers and deaf to clicks', async () => {
    await startDecoratedRound();
    const emblems = flag().querySelector('[data-decorations]') as HTMLElement;

    expect(emblems).toHaveAttribute('aria-hidden', 'true');
    // Without this the emblem swallows clicks meant for the band underneath.
    expect(emblems.style.pointerEvents).toBe('none');
  });

  it('says the emblem is not the player’s to colour', async () => {
    await startDecoratedRound();
    expect(flag()).toHaveAccessibleName(/not yours to colour/i);
  });

  it('cannot change a grade', async () => {
    const user = await startDecoratedRound();
    // Fill every region correctly and check: a decorated flag still grades as
    // exactly right, so the emblem is not being counted as an unfilled region.
    const entity = entities.find((candidate) => candidate.id === 'iraq')!;
    const spec = entity.colouring!;
    const template = templateById(spec.templateId)!;

    for (const region of template.regions) {
      await user.click(swatch(new RegExp(`^${COLOUR_NAMES[spec.regions[region.id]!]}$`, 'i')));
      await user.click(within(flag()).getByRole('button', { name: new RegExp(region.label, 'i') }));
    }

    await user.click(screen.getByRole('button', { name: /check my flag/i }));
    expect(screen.getByRole('heading', { name: /exactly right/i })).toBeInTheDocument();
  });
});
