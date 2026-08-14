import { useEffect } from 'react';
import type { Entity } from '@/data/schema';
import type { AnswerKind } from '@/engine/types';
import { optionLabel } from '@/engine/questions';
import { FlagImage } from './FlagImage';

interface OptionGridProps {
  options: Entity[];
  answerKind: AnswerKind;
  correctIds: string[];
  /** The option the player picked, or null while the question is still open. */
  chosenId: string | null;
  revealed: boolean;
  onSelect: (id: string) => void;
  /**
   * Number keys 1-8 select an option. Turned off for combo, where two grids
   * are on screen at once and a digit would be ambiguous.
   */
  keyboardShortcuts?: boolean;
  /** Accessible name for the list, needed when more than one grid is shown. */
  groupLabel?: string;
}

/**
 * The option grid — the signature element of the design (§10). Flags are
 * presented large and edge-to-edge as tappable colour fields, not as small
 * thumbnails inside cards.
 *
 * Layout follows §6.1: 4 options as 2×2, 6 as 2×3, 8 as 2×4 — two columns
 * throughout. On a narrow screen name options drop to one column while flags
 * stay two wide, which keeps an eight-option grid usable at 360px (§11).
 */
export function OptionGrid({
  options,
  answerKind,
  correctIds,
  chosenId,
  revealed,
  onSelect,
  keyboardShortcuts = true,
  groupLabel,
}: OptionGridProps) {
  const showsFlags = answerKind === 'flag';

  // Number keys 1–8 select an option (§11). Ignored while a text field has
  // focus so expert mode can share this screen.
  useEffect(() => {
    if (revealed || !keyboardShortcuts) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= options.length) return;
      event.preventDefault();
      onSelect(options[index]!.id);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [options, onSelect, revealed, keyboardShortcuts]);

  return (
    <ul
      {...(groupLabel ? { 'aria-label': groupLabel } : {})}
      className={[
        'grid gap-px border-2 border-line bg-line',
        showsFlags ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2',
      ].join(' ')}
    >
      {options.map((option, index) => {
        const isCorrect = correctIds.includes(option.id);
        const isChosen = option.id === chosenId;
        // After grading, the right answer is always shown — even when the
        // player picked something else (locked decision 2).
        const state = !revealed
          ? 'open'
          : isCorrect
            ? 'correct'
            : isChosen
              ? 'wrong'
              : 'dimmed';

        return (
          <li key={option.id} className="relative">
            <button
              type="button"
              disabled={revealed}
              onClick={() => onSelect(option.id)}
              aria-pressed={isChosen}
              className={[
                'flex min-h-16 w-full items-center gap-3 p-3 text-left transition-colors',
                'disabled:cursor-default',
                stateClasses[state],
              ].join(' ')}
            >
              {keyboardShortcuts && (
                <span
                  aria-hidden="true"
                  className={[
                    'label-caps flex h-7 w-7 shrink-0 items-center justify-center text-xs',
                    state === 'open' ? 'bg-ink text-paper-faint' : 'bg-black/20 text-current',
                  ].join(' ')}
                >
                  {index + 1}
                </span>
              )}

              {showsFlags ? (
                <FlagImage
                  entity={option}
                  revealName={revealed}
                  hiddenLabel={`Flag option ${index + 1}`}
                  className="w-full min-w-0 flex-1"
                />
              ) : (
                <span className="display-md min-w-0 flex-1 text-base break-words sm:text-lg">
                  {optionLabel(option, answerKind)}
                </span>
              )}

              {state === 'correct' && <Tick />}
              {state === 'wrong' && <Cross />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const stateClasses: Record<string, string> = {
  open: 'bg-ink-raised text-paper hover:bg-ink-sunken',
  correct: 'bg-correct text-paper',
  wrong: 'bg-wrong text-paper',
  dimmed: 'bg-ink-raised text-paper-faint opacity-60',
};

/**
 * Feedback carries an icon as well as a colour — never colour alone (§10).
 * The icon is labelled for assistive tech.
 */
function Tick() {
  return (
    <span role="img" aria-label="Correct" className="shrink-0">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path
          d="M4 13l5 5L20 6"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="square"
        />
      </svg>
    </span>
  );
}

function Cross() {
  return (
    <span role="img" aria-label="Incorrect" className="shrink-0">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" />
      </svg>
    </span>
  );
}
