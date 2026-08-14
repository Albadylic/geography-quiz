import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { entities } from '@/data/entities.generated';
import { CONTINENTS, type Continent } from '@/data/constants';
import type { Entity } from '@/data/schema';
import { isInContinent } from '@/engine/pool';
import { applyReview, orderByBox } from '@/engine/leitner';
import { smoothedErrorRate, summariseEntity, HARDEST_UNLOCK_THRESHOLD } from '@/engine/stats';
import { mulberry32, randomSeed, shuffle } from '@/engine/rng';
import { useStatsStore } from '@/store/statsStore';
import { FlagImage } from '@/components/FlagImage';

type DeckKind = { kind: 'continent'; continent: Continent } | { kind: 'hardest' } | { kind: 'shuffle' };

/** Revision — plan §6.4. No scoring, no timer. */
export function RevisionScreen() {
  const [deck, setDeck] = useState<DeckKind | null>(null);
  const [seed] = useState(() => randomSeed());

  if (!deck) return <DeckPicker onPick={setDeck} />;
  return <Flashcards deck={deck} seed={seed} onExit={() => setDeck(null)} />;
}

function DeckPicker({ onPick }: { onPick: (deck: DeckKind) => void }) {
  const answered = useStatsStore((state) => state.data.totals.questionsAnswered);
  const hardestUnlocked = answered >= HARDEST_UNLOCK_THRESHOLD;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="display-xl text-4xl text-paper sm:text-5xl">Revision</h1>
      <p className="mt-4 max-w-prose text-paper-dim">
        Flashcards, no score. Tap a card to turn it over, then say whether you knew
        it &mdash; what you miss comes back sooner.
      </p>

      <h2 className="label-caps mt-8 text-xs text-paper-faint">By continent</h2>
      <ul className="mt-2 grid grid-cols-1 gap-px border-2 border-line bg-line sm:grid-cols-2">
        {CONTINENTS.map((continent) => (
          <li key={continent}>
            <button
              type="button"
              onClick={() => onPick({ kind: 'continent', continent })}
              className="display-md w-full bg-ink-raised px-4 py-4 text-left text-base text-paper transition-colors hover:bg-ink-sunken"
            >
              {continent}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="label-caps mt-8 text-xs text-paper-faint">Other decks</h2>
      <ul className="mt-2 flex flex-col gap-px border-2 border-line bg-line">
        <li>
          <button
            type="button"
            disabled={!hardestUnlocked}
            onClick={() => onPick({ kind: 'hardest' })}
            className="w-full bg-ink-raised px-4 py-4 text-left transition-colors hover:bg-ink-sunken disabled:cursor-not-allowed disabled:text-paper-faint disabled:hover:bg-ink-raised"
          >
            <span className="display-md block text-base text-paper">My hardest</span>
            <span className="mt-1 block text-sm text-paper-dim">
              {hardestUnlocked
                ? 'The countries you keep getting wrong'
                : `Play a few rounds first — this deck uses your own results. ${answered}/${HARDEST_UNLOCK_THRESHOLD} answered.`}
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => onPick({ kind: 'shuffle' })}
            className="w-full bg-ink-raised px-4 py-4 text-left transition-colors hover:bg-ink-sunken"
          >
            <span className="display-md block text-base text-paper">Just browse</span>
            <span className="mt-1 block text-sm text-paper-dim">
              Everything, shuffled. Nothing is tracked.
            </span>
          </button>
        </li>
      </ul>

      <p className="mt-8 text-sm text-paper-faint">
        Prefer to be tested?{' '}
        <Link to="/" className="text-paper underline">
          Play a quiz instead
        </Link>
        .
      </p>
    </div>
  );
}

/** Cards for a deck, ordered so the least-known come first (except shuffle). */
function useDeck(deck: DeckKind, seed: number): Entity[] {
  const data = useStatsStore((state) => state.data);

  return useMemo(() => {
    const rng = mulberry32(seed);

    if (deck.kind === 'shuffle') return shuffle(rng, entities);

    if (deck.kind === 'continent') {
      const pool = entities.filter((entity) => isInContinent(entity, deck.continent));
      const shuffled = shuffle(rng, pool);
      const ordered = orderByBox(data, shuffled.map((entity) => entity.id));
      const byId = new Map(pool.map((entity) => [entity.id, entity]));
      return ordered.map((id) => byId.get(id)!);
    }

    // Hardest: the weakest by error rate, then least-known first.
    const weakest = Object.values(data.entityStats)
      .map(summariseEntity)
      .filter((summary) => summary.seen > 0)
      .sort((a, b) => smoothedErrorRate(b) - smoothedErrorRate(a))
      .slice(0, 30)
      .map((summary) => summary.entityId);

    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return orderByBox(data, shuffle(rng, weakest))
      .map((id) => byId.get(id))
      .filter((entity): entity is Entity => entity !== undefined);
  }, [deck, seed, data]);
}

function Flashcards({
  deck,
  seed,
  onExit,
}: {
  deck: DeckKind;
  seed: number;
  onExit: () => void;
}) {
  const cards = useDeck(deck, seed);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);

  /** "Just browse" is explicitly untracked (§6.4). */
  const tracked = deck.kind !== 'shuffle';

  const card = cards[index];

  const answer = (knewIt: boolean) => {
    if (!card) return;
    if (tracked) {
      const data = applyReview(useStatsStore.getState().data, card.id, knewIt);
      useStatsStore.setState({ data });
    }
    if (knewIt) setKnownCount((count) => count + 1);
    setFlipped(false);
    setIndex((current) => current + 1);
  };

  if (cards.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">Nothing in this deck</h1>
        <p className="mt-4 text-paper-dim">
          There&rsquo;s nothing to revise here yet. Play a round and come back.
        </p>
        <button
          type="button"
          onClick={onExit}
          className="label-caps mt-8 bg-paper px-5 py-3 text-sm text-ink"
        >
          Pick another deck
        </button>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">Deck finished</h1>
        <p className="mt-4 text-paper-dim">
          You knew {knownCount} of {cards.length}.
          {tracked ? ' The ones you missed will come round sooner.' : ''}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="label-caps mt-8 bg-signal-red px-5 py-3 text-sm text-paper"
        >
          Pick another deck
        </button>
      </div>
    );
  }

  const capital = card.capitals.find((entry) => entry.isPrimary)?.name;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onExit}
          className="label-caps text-xs text-paper-faint hover:text-paper"
        >
          Decks
        </button>
        <p className="label-caps ml-auto text-xs text-paper-dim">
          <span className="text-paper">{index + 1}</span> / {cards.length}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((current) => !current)}
        aria-expanded={flipped}
        className="mt-6 flex min-h-72 w-full flex-col items-center justify-center border-2 border-line bg-ink-raised p-6 text-center transition-colors hover:bg-ink-sunken"
      >
        {flipped ? (
          <>
            {/* Flipped: the card is the answer, so the flag names itself. */}
            <FlagImage entity={card} revealName className="w-48 max-w-full" />
            <p className="display-md mt-4 text-2xl text-paper">{card.name}</p>
            <p className="mt-2 text-paper-dim">
              {capital ? `Capital: ${capital}` : 'No capital'}
            </p>
            <p className="text-sm text-paper-faint">{card.continent}</p>
          </>
        ) : (
          <>
            <p className="display-xl text-3xl text-paper sm:text-5xl">{card.name}</p>
            <p className="label-caps mt-6 text-xs text-paper-faint">Tap to turn over</p>
          </>
        )}
      </button>

      {flipped && (
        <div className="mt-4 flex flex-col gap-px sm:flex-row">
          <button
            type="button"
            onClick={() => answer(true)}
            className="label-caps flex-1 bg-correct px-6 py-4 text-sm text-paper"
          >
            Knew it
          </button>
          <button
            type="button"
            onClick={() => answer(false)}
            className="label-caps flex-1 bg-wrong px-6 py-4 text-sm text-paper"
          >
            Didn&rsquo;t know it
          </button>
        </div>
      )}

      {!tracked && (
        <p className="mt-4 text-sm text-paper-faint">
          Browsing &mdash; nothing here is recorded.
        </p>
      )}
    </div>
  );
}
