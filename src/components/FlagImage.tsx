import type { Entity } from '@/data/schema';

interface FlagImageProps {
  entity: Entity;
  /**
   * Whether the flag may name its country.
   *
   * §11: alt text is a spoiler. While a question is live this must be false,
   * so a screen-reader user is asked the same question a sighted user is.
   * After grading, and everywhere in review, it becomes true.
   *
   * Deliberately required and deliberately not defaulted — a caller that
   * forgets it gets a type error rather than a leaked answer.
   */
  revealName: boolean;
  /**
   * What to call the flag while `revealName` is false, e.g. "Flag option 2".
   * Falls back to a bare "Flag".
   */
  hiddenLabel?: string;
  /** Sizing/positioning for the outer frame. */
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

/**
 * Renders a flag at its own aspect ratio.
 *
 * The frame takes the ratio recorded in the data — 1:1 for Switzerland and
 * Vatican City, 2:1 for Saint Helena, 4:3 for the rest — and the image is
 * `object-contain` inside it, so nothing is ever stretched regardless of the
 * width it is given (§3.3).
 */
export function FlagImage({
  entity,
  revealName,
  hiddenLabel,
  className,
  loading = 'lazy',
  fetchPriority = 'auto',
}: FlagImageProps) {
  const alt = revealName ? `Flag of ${entity.name}` : (hiddenLabel ?? 'Flag');

  return (
    <span
      className={['block overflow-hidden bg-ink-sunken', className].filter(Boolean).join(' ')}
      style={{ aspectRatio: String(entity.flag.aspectRatio) }}
      // Mirrors the inline style as a plain attribute. jsdom drops
      // `aspect-ratio` from its CSSOM entirely — including from
      // `toHaveStyle`, which passes against any value — so without this the
      // ratio is untestable outside a real browser.
      data-aspect-ratio={entity.flag.aspectRatio}
    >
      <img
        src={entity.flag.file}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        draggable={false}
        className="h-full w-full object-contain"
        // No `title`: it would surface the country on hover and in some
        // assistive tech even when the answer is meant to be hidden.
        {...(revealName ? { title: entity.name } : {})}
      />
    </span>
  );
}
