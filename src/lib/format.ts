import type { QuizConfig } from '@/engine/types';

/**
 * Display formatting shared by the results and stats screens.
 *
 * Kept out of the engine: this is presentation, and it is the one place UI
 * strings for a config are built, so §9's "Flags · hard · 50 · Europe" line
 * and the results header cannot drift apart.
 */

/** A readable rendering of a quiz config (§9). */
export function describeConfig(config: QuizConfig): string {
  const continents =
    config.pool.continents === 'all'
      ? 'World'
      : [...config.pool.continents].sort().join(' + ');

  const parts = [
    config.mode,
    config.difficulty,
    config.length === 'all' ? 'all' : String(config.length),
    continents,
  ];
  if (config.pool.source === 'hardest') parts.push('hardest');

  return parts.join(' · ');
}

/**
 * Turns a stored config signature back into §9's readable line — "Flags · hard
 * · 50 · Europe". Signatures are produced by `configSignature` in the engine
 * and are pipe-separated, in the order mode, direction, difficulty, length,
 * continents, source.
 *
 * Old signatures from an earlier build may have fewer parts, so anything
 * missing is simply left out rather than rendered as "undefined".
 */
export function describeSignature(signature: string): string {
  const [mode, direction, difficulty, length, continents, source] = signature.split('|');

  const parts = [mode, difficulty, length].filter(Boolean) as string[];
  if (continents) parts.push(continents === 'all' ? 'World' : continents.split('+').join(' + '));
  if (source === 'hardest') parts.push('hardest');
  if (direction === 'b-to-a') parts.push('reversed');
  if (direction === 'mixed') parts.push('mixed');

  return parts.join(' · ');
}
