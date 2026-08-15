import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cancelIdle, prefetchQuizChunks } from '@/lib/prefetch';

interface ModeCard {
  to: string;
  name: string;
  blurb: string;
  accent: string;
}

const modes: ModeCard[] = [
  {
    to: '/play/flags/setup',
    name: 'Flags',
    blurb: 'Match the flag to the country, or the country to its flag.',
    accent: 'bg-signal-red',
  },
  {
    to: '/play/capitals/setup',
    name: 'Capitals',
    blurb: 'Name the capital, or name the country from its capital.',
    accent: 'bg-signal-blue',
  },
  {
    to: '/play/combo/setup',
    name: 'Combo',
    blurb: 'One country, two questions: the flag and the capital together.',
    accent: 'bg-signal-green',
  },
  {
    to: '/play/colour/setup',
    name: 'Colour the flag',
    blurb: 'Fill in the regions of a blank flag from memory.',
    accent: 'bg-signal-yellow',
  },
  {
    to: '/revision',
    name: 'Revision',
    blurb: 'Flashcards, no score. Learn before you test.',
    accent: 'bg-paper',
  },
];

export function HomeScreen() {
  // Whatever mode they pick, the next screen is a setup screen reading the
  // dataset. Warm both while they are still choosing.
  useEffect(() => {
    const handle = prefetchQuizChunks();
    return () => cancelIdle(handle);
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="display-xl text-5xl text-paper sm:text-7xl">
        Learn the
        <br />
        world
      </h1>
      <p className="mt-4 max-w-prose text-paper-dim">
        Flags, countries and capitals. Five ways to practise, and it remembers which
        ones you keep getting wrong.
      </p>

      <ul className="mt-10 grid gap-px border-2 border-line bg-line sm:grid-cols-2">
        {modes.map((mode) => (
          <li key={mode.to} className="bg-ink">
            <Link
              to={mode.to}
              className="group flex h-full items-stretch gap-4 bg-ink-raised transition-colors hover:bg-ink-sunken"
            >
              <span aria-hidden="true" className={`w-3 shrink-0 ${mode.accent}`} />
              <span className="flex flex-col justify-center py-6 pr-5">
                <span className="display-md text-2xl text-paper">{mode.name}</span>
                <span className="mt-1 text-sm text-paper-dim">{mode.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
