import { stripDiacritics } from './text';

/**
 * Text normalisation and edit distance for expert-mode grading — plan §5.3.
 *
 *   normalise(s) = lowercase
 *                → strip diacritics (NFD + combining-mark removal)
 *                → strip punctuation and the article "the"
 *                → collapse internal whitespace, trim
 */
export function normalise(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    // Punctuation becomes a space rather than nothing, so "Côte d'Ivoire"
    // normalises the same way whether the player types the apostrophe or not.
    .replace(/[^a-z0-9]+/g, ' ')
    // "the" only as a standalone word: "The Gambia" -> "gambia", but
    // "Netherlands" keeps its letters.
    .replace(/\b(?:the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance, abandoned early once every cell in a row exceeds
 * `max`. Grading compares one input against a few hundred candidates, and the
 * early exit keeps that cheap.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }

  return previous[b.length]!;
}

/**
 * How much misspelling to forgive (§5.3): distance 1 under 8 characters,
 * 2 at 8 or more. Measured on the normalised input, so punctuation the player
 * typed does not buy them extra latitude.
 */
export function fuzzyTolerance(normalisedInput: string): number {
  return normalisedInput.length < 8 ? 1 : 2;
}
