import { useMemo, useState } from 'react';
import { entities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';
import { gradeCombo } from '@/engine/grading';
import type { Answer, Question, StatMode } from '@/engine/types';
import { OptionGrid } from '@/components/OptionGrid';

const byId = new Map(entities.map((entity) => [entity.id, entity]));

interface ComboAnswerProps {
  question: Question;
  /** Set once the answer has been graded; null while it is still open. */
  revealed: Answer | null;
  onSubmit: (answer: Answer) => void;
}

/**
 * Combo mode — §6.3. One country prompt, two independent groups, both required
 * before Continue.
 *
 * Neither group is graded until both are chosen, so a player can change their
 * mind about the first while deciding the second.
 */
export function ComboAnswer({ question, revealed, onSubmit }: ComboAnswerProps) {
  const [picked, setPicked] = useState<Partial<Record<StatMode, string>>>({});
  const halves = useMemo(() => question.halves ?? [], [question.halves]);

  const choose = (statMode: StatMode, id: string) => {
    if (revealed) return;
    setPicked((current) => ({ ...current, [statMode]: id }));
  };

  const bothAnswered = halves.every((half) => picked[half.statMode] !== undefined);

  const submit = () => {
    if (!bothAnswered || revealed) return;
    onSubmit(gradeCombo(question, picked));
    setPicked({});
  };

  return (
    <div className="flex flex-col gap-2 sm:gap-6">
      {halves.map((half) => {
        const options = half.options
          .map((id) => byId.get(id))
          .filter((entity): entity is Entity => entity !== undefined);

        return (
          <section key={half.statMode}>
            <h2 className="label-caps mb-1 text-xs text-paper-faint sm:mb-2">
              {half.statMode === 'flags' ? 'Its flag' : 'Its capital'}
            </h2>
            <OptionGrid
              options={options}
              answerKind={half.answerKind}
              correctIds={half.correctIds}
              chosenId={
                revealed
                  ? (revealed.halfGiven?.[half.statMode] ?? null)
                  : (picked[half.statMode] ?? null)
              }
              revealed={revealed !== null}
              onSelect={(id) => choose(half.statMode, id)}
              /* Number keys would be ambiguous across two grids. */
              keyboardShortcuts={false}
              groupLabel={half.statMode === 'flags' ? 'Flag options' : 'Capital options'}
            />
          </section>
        );
      })}

      {!revealed && (
        <button
          type="button"
          onClick={submit}
          disabled={!bothAnswered}
          className="label-caps w-full bg-signal-red px-6 py-3 text-sm text-paper sm:py-4 transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:bg-ink-raised disabled:text-paper-faint"
        >
          {bothAnswered ? 'Check both answers' : 'Choose a flag and a capital'}
        </button>
      )}
    </div>
  );
}
