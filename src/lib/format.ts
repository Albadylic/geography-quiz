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
