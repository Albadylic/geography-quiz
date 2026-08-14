import type { Answer, Question } from './types';

/**
 * Answer checking — plan §5.3.
 *
 * Multiple choice is an id comparison and lives here. Free-text (expert)
 * matching needs normalisation and edit distance, and arrives with T2.1.
 */

/** Grades a multiple-choice selection. `null` means skipped. */
export function gradeChoice(question: Question, chosenId: string | null): Answer {
  return {
    questionId: question.id,
    given: chosenId,
    correct: chosenId !== null && question.correctIds.includes(chosenId),
  };
}
