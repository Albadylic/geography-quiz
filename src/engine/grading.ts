import { entities as allEntities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';
import { fuzzyTolerance, levenshtein, normalise } from '@/lib/normalise';
import type { Answer, AnswerKind, Question } from './types';

/**
 * Answer checking — plan §5.3.
 *
 * Multiple choice is an id comparison. Free text is the interesting half: it
 * has to forgive a misspelling without ever accepting a different country.
 */

/** Grades a multiple-choice selection. `null` means skipped. */
export function gradeChoice(question: Question, chosenId: string | null): Answer {
  return {
    questionId: question.id,
    given: chosenId,
    correct: chosenId !== null && question.correctIds.includes(chosenId),
  };
}

// ---------------------------------------------------------------------------
// Free-text matching
// ---------------------------------------------------------------------------

/**
 * Every accepted spelling in the dataset, normalised, mapped to the entities
 * that own it. This is what stops a fuzzy match from crossing between two real
 * countries — see `matchesText`.
 */
export interface AnswerIndex {
  /** normalised country name or alias -> owning entity ids */
  names: Map<string, Set<string>>;
  /** normalised capital name or alias -> owning entity ids */
  capitals: Map<string, Set<string>>;
}

function addTo(index: Map<string, Set<string>>, key: string, id: string): void {
  if (!key) return;
  const existing = index.get(key);
  if (existing) existing.add(id);
  else index.set(key, new Set([id]));
}

export function buildAnswerIndex(entities: readonly Entity[] = allEntities): AnswerIndex {
  const names = new Map<string, Set<string>>();
  const capitals = new Map<string, Set<string>>();

  for (const entity of entities) {
    addTo(names, normalise(entity.name), entity.id);
    for (const alias of entity.aliases) addTo(names, normalise(alias), entity.id);

    for (const capital of entity.capitals) {
      addTo(capitals, normalise(capital.name), entity.id);
      for (const alias of capital.aliases) addTo(capitals, normalise(alias), entity.id);
    }
  }

  return { names, capitals };
}

/** Cached for the real dataset; tests can build their own. */
let defaultIndex: AnswerIndex | null = null;
export function defaultAnswerIndex(): AnswerIndex {
  defaultIndex ??= buildAnswerIndex();
  return defaultIndex;
}

/**
 * Every spelling that counts as naming this entity, for the given answer kind.
 *
 * For capitals this is *all* of them, not just the primary: §3.3 says any
 * listed capital is accepted in expert mode, so South Africa takes Pretoria,
 * Cape Town or Bloemfontein.
 */
export function acceptedForms(entity: Entity, answerKind: AnswerKind): string[] {
  if (answerKind === 'capital') {
    return entity.capitals.flatMap((capital) => [capital.name, ...capital.aliases]);
  }
  return [entity.name, ...entity.aliases];
}

export interface TextMatchOptions {
  index?: AnswerIndex;
}

/**
 * Does this typed answer name this entity?
 *
 * 1. Exact match, after normalisation, against any accepted spelling.
 * 2. Otherwise, if the input is the exact name of *some other* entity, reject
 *    it outright — see the note below.
 * 3. Otherwise accept within the §5.3 edit-distance tolerance.
 *
 * Step 2 is not in the plan's wording, and without it the rule in §5.3 fails
 * its own acceptance criterion. "Australia" and "Austria" are edit distance 2,
 * not the 3 the plan states, so a 9-character input with a tolerance of 2
 * would grade Australia as Austria — the exact false positive §12 requires be
 * rejected. The same rule would accept "Iran" for Iraq and "Zambia" for
 * Gambia, both distance 1. An input that is *exactly* the name of a real
 * country is never a misspelling of a different one, so it is never fuzzy-
 * matched.
 */
export function matchesText(
  input: string,
  entity: Entity,
  answerKind: AnswerKind,
  options: TextMatchOptions = {},
): boolean {
  const typed = normalise(input);
  if (!typed) return false;

  const forms = acceptedForms(entity, answerKind).map(normalise).filter(Boolean);
  if (forms.includes(typed)) return true;

  const index = options.index ?? defaultAnswerIndex();
  const lookup = answerKind === 'capital' ? index.capitals : index.names;
  const owners = lookup.get(typed);
  if (owners && owners.size > 0 && !owners.has(entity.id)) return false;

  const tolerance = fuzzyTolerance(typed);
  return forms.some((form) => levenshtein(typed, form, tolerance) <= tolerance);
}

/** Grades a free-text answer against the question's target entity. */
export function gradeFreeText(
  question: Question,
  input: string | null,
  entity: Entity,
  options: TextMatchOptions = {},
): Answer {
  const given = input === null ? null : input.trim();
  return {
    questionId: question.id,
    given: given === '' ? null : given,
    correct: given !== null && matchesText(given, entity, question.answerKind, options),
  };
}
