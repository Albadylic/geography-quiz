import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlagImage } from './FlagImage';
import { entities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';

function entity(id: string): Entity {
  const found = entities.find((e) => e.id === id);
  if (!found) throw new Error(`fixture entity "${id}" missing from the dataset`);
  return found;
}

const switzerland = entity('switzerland'); // 1:1
const france = entity('france'); // 4:3
const saintHelena = entity('saint-helena-ascension-and-tristan-da-cunha'); // 2:1

describe('FlagImage alt text (§11 — the flag must not name itself)', () => {
  it('uses a generic alt and no title while the answer is hidden', () => {
    render(<FlagImage entity={france} revealName={false} hiddenLabel="Flag option 2" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'Flag option 2');
    expect(img).not.toHaveAttribute('title');
  });

  it('never leaks the country name in any attribute while hidden', () => {
    render(<FlagImage entity={france} revealName={false} hiddenLabel="Flag option 1" />);
    const img = screen.getByRole('img');
    for (const attribute of Array.from(img.attributes)) {
      // The src necessarily contains the ISO code; everything a screen reader
      // or a hover would surface must not contain the name.
      if (attribute.name === 'src') continue;
      expect(attribute.value.toLowerCase()).not.toContain(france.name.toLowerCase());
    }
  });

  it('falls back to a bare "Flag" when no hidden label is given', () => {
    render(<FlagImage entity={france} revealName={false} />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Flag');
  });

  it('names the country once the answer is revealed', () => {
    render(<FlagImage entity={france} revealName />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', `Flag of ${france.name}`);
    expect(img).toHaveAttribute('title', france.name);
  });

  it('ignores hiddenLabel once revealed', () => {
    render(<FlagImage entity={france} revealName hiddenLabel="Flag option 3" />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', `Flag of ${france.name}`);
  });
});

/**
 * These assert `data-aspect-ratio`, not the inline style. jsdom does not
 * implement the `aspect-ratio` CSS property: it drops it from the CSSOM, and
 * `toHaveStyle({ aspectRatio })` consequently passes against *any* value —
 * verified by asserting a deliberately wrong one. The component mirrors the
 * ratio onto an attribute so this is a real assertion.
 */
describe('FlagImage aspect ratios (§3.3 — never assume 3:2)', () => {
  function frameOf(entityToRender: Entity): HTMLElement {
    const { container } = render(<FlagImage entity={entityToRender} revealName />);
    return container.firstElementChild as HTMLElement;
  }

  it('frames a square flag at 1:1', () => {
    expect(frameOf(switzerland)).toHaveAttribute('data-aspect-ratio', '1');
  });

  it('frames a 4:3 flag at its own ratio', () => {
    expect(frameOf(france)).toHaveAttribute('data-aspect-ratio', '1.3333');
  });

  it('frames a 2:1 flag at its own ratio', () => {
    expect(frameOf(saintHelena)).toHaveAttribute('data-aspect-ratio', '2');
  });

  it('takes the ratio from the data rather than assuming one', () => {
    // Every distinct ratio in the dataset must survive to the DOM.
    const ratios = [...new Set(entities.map((e) => e.flag.aspectRatio))];
    expect(ratios.length).toBeGreaterThan(1);
    for (const ratio of ratios) {
      const sample = entities.find((e) => e.flag.aspectRatio === ratio)!;
      expect(frameOf(sample)).toHaveAttribute('data-aspect-ratio', String(ratio));
    }
  });

  it('gives differently-shaped flags different frames at the same width', () => {
    const { container: squareBox } = render(
      <FlagImage entity={switzerland} revealName className="w-40" />,
    );
    const { container: wideBox } = render(
      <FlagImage entity={saintHelena} revealName className="w-40" />,
    );

    const square = squareBox.firstElementChild as HTMLElement;
    const wide = wideBox.firstElementChild as HTMLElement;

    // Same width class, different ratio — so the heights differ and neither
    // image is squashed to fit the other's box.
    expect(square.className).toContain('w-40');
    expect(wide.className).toContain('w-40');
    expect(square.getAttribute('data-aspect-ratio')).toBe('1');
    expect(wide.getAttribute('data-aspect-ratio')).toBe('2');
  });

  it('contains the image inside its frame rather than stretching it', () => {
    render(<FlagImage entity={switzerland} revealName />);
    expect(screen.getByRole('img').className).toContain('object-contain');
  });

  it('lazy-loads by default and allows an eager override for the current question', () => {
    const { unmount } = render(<FlagImage entity={france} revealName />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
    unmount();

    render(<FlagImage entity={france} revealName loading="eager" fetchPriority="high" />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'eager');
  });
});
