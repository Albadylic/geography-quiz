import { entities as allEntities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';
import { normalise } from '@/lib/normalise';
import type { AnswerKind } from './types';

/**
 * Autocomplete suggestions for expert mode — plan §5.3 and T2.2.
 *
 * The risk this guards against is the one named in §14: an autocomplete that
 * does the recalling for the player makes expert mode trivial. The rules below
 * are what keep it a spelling aid rather than an answer key.
 */

/** Nothing is suggested until the player has committed two characters (§5.3). */
export const MIN_QUERY_LENGTH = 2;

/** At most eight suggestions (§5.3). */
export const MAX_SUGGESTIONS = 8;

/**
 * A list with exactly one entry names the answer outright, so it is withheld
 * at the minimum query length. This is what satisfies T2.2's criterion: a
 * two-character prefix can never surface a sole suggestion.
 *
 * Set to exactly one character above the minimum, and no higher, because a
 * larger threshold makes suggestions *disappear* as the player types. At 4 it
 * did: "fr" offered France, "fra" offered nothing (France is the only country
 * matching "fra", so the lone result was withheld), and "fran" offered it
 * again. Vanishing on further input reads as a broken input box.
 */
export const MIN_LENGTH_FOR_SOLE_SUGGESTION = MIN_QUERY_LENGTH + 1;

export interface Suggestion {
  entityId: string;
  /** Exactly what goes into the input when chosen, so it grades as typed. */
  label: string;
}

/**
 * One suggestible answer: the spelling that is *offered*, and every spelling
 * that will *find* it.
 *
 * Aliases match but are never displayed. Someone who knows the country as
 * "Côte d'Ivoire" types "cote" and is offered "Ivory Coast"; someone who types
 * "holl" is offered "Netherlands". That helps them find it without teaching a
 * name the dataset does not treat as canonical.
 */
interface Candidate {
  entityId: string;
  label: string;
  forms: string[];
}

function candidatesFor(entity: Entity, answerKind: AnswerKind): Candidate[] {
  if (answerKind === 'capital') {
    return entity.capitals.map((capital) => ({
      entityId: entity.id,
      label: capital.name,
      forms: [capital.name, ...capital.aliases],
    }));
  }
  return [{ entityId: entity.id, label: entity.name, forms: [entity.name, ...entity.aliases] }];
}

/**
 * Suggestions for a partial answer, prefix matches first and substring matches
 * after, capped at `MAX_SUGGESTIONS`.
 */
export function suggest(
  query: string,
  answerKind: AnswerKind,
  entities: readonly Entity[] = allEntities,
): Suggestion[] {
  const typed = normalise(query);
  if (typed.length < MIN_QUERY_LENGTH) return [];

  const prefix: Suggestion[] = [];
  const substring: Suggestion[] = [];

  for (const entity of entities) {
    for (const candidate of candidatesFor(entity, answerKind)) {
      const forms = candidate.forms.map(normalise).filter(Boolean);
      const suggestion = { entityId: candidate.entityId, label: candidate.label };

      if (forms.some((form) => form.startsWith(typed))) {
        prefix.push(suggestion);
        continue;
      }

      // Substring matching is deliberately limited to the displayed name.
      // Applied to aliases it produces bewildering results — "zim" appears
      // inside Comoros's alias "Udzima wa Komori" — while the case it exists
      // to serve, "guinea" finding Papua New Guinea, is about the name itself.
      if (normalise(candidate.label).includes(typed)) substring.push(suggestion);
    }
  }

  const ordered = [
    ...prefix.sort((a, b) => a.label.localeCompare(b.label)),
    ...substring.sort((a, b) => a.label.localeCompare(b.label)),
  ];

  // Withhold a lone suggestion at short prefixes — see the constant above.
  if (ordered.length === 1 && typed.length < MIN_LENGTH_FOR_SOLE_SUGGESTION) return [];

  return ordered.slice(0, MAX_SUGGESTIONS);
}
