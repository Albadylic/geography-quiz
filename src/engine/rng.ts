/**
 * Seeded randomness — plan §2.
 *
 * Every random choice the quiz makes goes through here, seeded from the
 * session. That buys reproducible tests, replayable quizzes, and "share this
 * quiz" for free. Nothing in the engine may call Math.random().
 */

/** A function returning the next value in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. Chosen over
 * something like xorshift because it passes gjrand at 32 bits and needs one
 * word of state, which is all a quiz needs.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a fresh session. The one place a non-seeded random is allowed. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Integer in [0, max). */
export function randomInt(rng: Rng, max: number): number {
  if (max <= 0) throw new Error(`randomInt needs a positive bound, got ${max}`);
  return Math.floor(rng() * max);
}

/**
 * Fisher–Yates, returning a new array. Unbiased: index i is drawn from
 * [0, i] inclusive, which is the detail the naive version gets wrong.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Uniform sample of `count` items without replacement. */
export function sample<T>(rng: Rng, items: readonly T[], count: number): T[] {
  return shuffle(rng, items).slice(0, Math.max(0, Math.min(count, items.length)));
}

/** One item, or undefined for an empty list. */
export function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(rng, items.length)];
}

/**
 * Weighted sample without replacement, used by Hardest-countries mode (§8) so
 * consecutive sessions over the same weak list are not identical.
 *
 * Uses the exponential-jump / A-Res method: each item gets a key of
 * `rng^(1/weight)` and the top `count` keys win. Equivalent to repeated
 * weighted draws without replacement, in one pass.
 *
 * Items with a non-positive weight are treated as unselectable unless there
 * are too few positive-weight items to fill the request, in which case they
 * back-fill in shuffled order rather than the caller getting a short list.
 */
export function weightedSample<T>(
  rng: Rng,
  items: readonly T[],
  weightOf: (item: T) => number,
  count: number,
): T[] {
  const wanted = Math.max(0, Math.min(count, items.length));
  if (wanted === 0) return [];

  const eligible: Array<{ item: T; key: number }> = [];
  const ineligible: T[] = [];

  for (const item of items) {
    const weight = weightOf(item);
    if (!Number.isFinite(weight) || weight <= 0) {
      ineligible.push(item);
      continue;
    }
    // rng() can return exactly 0; nudge it so the key stays well defined.
    const u = Math.max(rng(), Number.MIN_VALUE);
    eligible.push({ item, key: Math.pow(u, 1 / weight) });
  }

  eligible.sort((a, b) => b.key - a.key);
  const chosen = eligible.slice(0, wanted).map((entry) => entry.item);

  if (chosen.length < wanted) {
    chosen.push(...shuffle(rng, ineligible).slice(0, wanted - chosen.length));
  }
  return chosen;
}
