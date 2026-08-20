import { entityById } from '@/data/lookup';
import type { Question } from '@/engine/types';
import { FlagImage } from '@/components/FlagImage';

/** Renders whichever half of the pair is being asked about (§6.1, §6.2). */
export function Prompt({ question }: { question: Question }) {
  const entity = entityById(question.entityId);

  if (question.prompt.kind === 'flag' && entity) {
    return (
      <figure className="m-0">
        <figcaption className="label-caps mb-2 text-xs text-paper-faint sm:mb-3">
          Which country flies this flag?
        </figcaption>
        {/*
          revealName is false: the alt text must not give the answer (§11).

          Sized by *height* on a phone, not width. At 390px a full-width 4:3
          flag is ~270px tall — the biggest single consumer on the screen, and
          most of the reason an eight-option question did not fit. FlagImage
          puts `aspect-ratio` on a wrapper with `overflow-hidden`, so capping
          with `max-h` alongside `w-full` would crop the flag rather than
          shrink it; giving it a height and `w-auto` lets the ratio derive the
          width, which keeps 1:1 and 2:1 flags honest too.
        */}
        <FlagImage
          entity={entity}
          revealName={false}
          hiddenLabel="The flag in question"
          className="h-[26vh] w-auto max-w-full sm:h-auto sm:w-full sm:max-w-md"
          loading="eager"
          fetchPriority="high"
        />
      </figure>
    );
  }

  const label = question.halves
    ? 'Pick the flag and the capital for'
    : question.prompt.kind === 'capital'
      ? 'Which country has this capital?'
      : question.answerKind === 'capital'
        ? 'What is the capital of'
        : 'Which flag belongs to';

  return (
    <div>
      <p className="label-caps mb-1 text-xs text-paper-faint sm:mb-2">{label}</p>
      <p className="display-xl text-3xl text-paper sm:text-6xl">{question.prompt.value}</p>
    </div>
  );
}
