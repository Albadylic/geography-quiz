import type { Entity } from '@/data/schema';
import { optionLabel } from '@/engine/questions';
import type { Answer, CountrySet, QuizConfig, Question } from '@/engine/types';

/**
 * How a country set is named in a config line. The default is left unlabelled:
 * naming it on every result would be noise on the setting almost every game
 * uses, while a widened pool is exactly the thing worth showing.
 */
const COUNTRY_SET_LABELS: Record<CountrySet, string> = {
  un: '',
  'un-plus-disputed': '+ disputed',
  all: '+ territories',
};

function countrySetLabel(set: string | undefined): string {
  if (!set) return '';
  return COUNTRY_SET_LABELS[set as CountrySet] ?? '';
}

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

  const set = countrySetLabel(config.pool.countrySet);
  if (set) parts.push(set);

  return parts.join(' · ');
}

/**
 * Turns a stored config signature back into §9's readable line — "Flags · hard
 * · 50 · Europe". Signatures are produced by `configSignature` in the engine
 * and are pipe-separated, in the order mode, direction, difficulty, length,
 * continents, source, country set.
 *
 * Old signatures from an earlier build may have fewer parts, so anything
 * missing is simply left out rather than rendered as "undefined".
 */
export function describeSignature(signature: string): string {
  const [mode, direction, difficulty, length, continents, source, countrySet] =
    signature.split('|');

  const parts = [mode, difficulty, length].filter(Boolean) as string[];
  if (continents) parts.push(continents === 'all' ? 'World' : continents.split('+').join(' + '));
  if (source === 'hardest') parts.push('hardest');
  if (direction === 'b-to-a') parts.push('reversed');
  if (direction === 'mixed') parts.push('mixed');

  const set = countrySetLabel(countrySet);
  if (set) parts.push(set);

  return parts.join(' · ');
}

/**
 * What the live region says once an answer is graded (§11).
 *
 * Combo reports each half, because "incorrect" alone would not say which one
 * was wrong — and names the right answer for any half that was missed, so a
 * screen-reader user learns exactly as much from a combo question as from an
 * ordinary one. Getting only half of that was the §11 promise half-kept.
 */
export function announce(answer: Answer, question: Question, entity: Entity): string {
  if (question.halves) {
    const parts = question.halves.map((half) => {
      const right = answer.halfResults?.[half.statMode] === true;
      const label = half.statMode === 'flags' ? 'flag' : 'capital';
      if (right) return `${label} correct`;

      const correct = optionLabel(entity, half.answerKind) || entity.name;
      // The flag half's answer *is* the country, which the prompt already
      // said; naming it again would be noise rather than information.
      return half.answerKind === 'flag'
        ? `${label} incorrect`
        : `${label} incorrect, it is ${correct}`;
    });
    return `${entity.name}: ${parts.join(', ')}`;
  }

  if (answer.correct) return 'Correct';
  return `Incorrect, the answer was ${optionLabel(entity, question.answerKind) || entity.name}`;
}
