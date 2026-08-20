/**
 * Confirming a quit mid-quiz (R3).
 *
 * The copy is the point: it says exactly what is kept and what is lost before
 * it happens, rather than after. Answers already given still count towards
 * per-country stats, but an unfinished quiz does not score, so it cannot set a
 * high score.
 */
export function QuitConfirmation({
  answered,
  total,
  onQuit,
  onKeepPlaying,
}: {
  /** Questions answered so far — not the question number. */
  answered: number;
  total: number;
  onQuit: () => void;
  onKeepPlaying: () => void;
}) {
  return (
    <div className="mb-6 border-2 border-signal-yellow bg-ink-raised p-4">
      <p className="text-paper">
        Quit after {answered} of {total} questions?
      </p>
      <p className="mt-2 text-sm text-paper-dim">
        {answered === 0
          ? 'You haven’t answered anything yet, so there’s nothing to keep.'
          : `Your ${answered} answer${answered === 1 ? '' : 's'} will be kept towards your per-country stats, but an unfinished quiz doesn’t score, so it won’t count towards a high score.`}
      </p>
      <div className="mt-4 flex flex-col gap-px sm:flex-row">
        <button
          type="button"
          onClick={onQuit}
          className="label-caps bg-signal-red px-5 py-3 text-sm text-paper"
        >
          Quit the quiz
        </button>
        <button
          type="button"
          onClick={onKeepPlaying}
          className="label-caps bg-ink px-5 py-3 text-sm text-paper"
        >
          Keep playing
        </button>
      </div>
    </div>
  );
}
