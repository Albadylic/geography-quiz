import { useState } from 'react';
import { entities } from '@/data/entities.generated';
import { useStatsStore } from '@/store/statsStore';
import { countrySetSize } from '@/engine/pool';
import type { CountrySet } from '@/engine/types';

/** Mirrors the setup screen's choices, so the two never drift apart. */
const COUNTRY_SET_OPTIONS: ReadonlyArray<{
  value: CountrySet;
  label: string;
  hint: string;
}> = [
  {
    value: 'un',
    label: 'UN countries',
    hint: 'The 193 member states plus Palestine and Vatican City — the countries most people expect to be asked about.',
  },
  {
    value: 'un-plus-disputed',
    label: 'Plus disputed',
    hint: 'Adds Kosovo, Taiwan and Western Sahara — widely recognised, but not UN members.',
  },
  {
    value: 'all',
    label: 'Everything',
    hint: 'Adds territories, dependencies and special administrative regions: Puerto Rico, Greenland, Hong Kong and the rest.',
  },
];

/** Settings — plan §3.3 and T3.5. */
export function SettingsScreen() {
  const settings = useStatsStore((state) => state.data.settings);
  const loadStatus = useStatsStore((state) => state.loadStatus);
  const updateSettings = useStatsStore((state) => state.updateSettings);
  const resetAll = useStatsStore((state) => state.resetAll);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const unMembers = entities.filter((entity) => entity.status === 'un-member').length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="display-xl text-4xl text-paper sm:text-5xl">Settings</h1>

      {/*
        The default a new game starts from, not a lock: every setup screen
        offers the same three sets and starts on whichever is chosen here.
      */}
      <fieldset className="mt-8">
        <legend className="label-caps mb-2 text-xs text-paper-faint">
          Countries to quiz on
        </legend>
        <div className="flex flex-col gap-px border-2 border-line bg-line">
          {COUNTRY_SET_OPTIONS.map((option) => {
            const selected = settings.countrySet === option.value;
            return (
              <label
                key={option.value}
                className={[
                  'flex cursor-pointer items-start gap-4 p-4 transition-colors',
                  'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-signal-yellow has-[:focus-visible]:-outline-offset-3',
                  selected ? 'bg-paper text-ink' : 'bg-ink-raised text-paper',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="default-country-set"
                  checked={selected}
                  onChange={() => updateSettings({ countrySet: option.value })}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-1 block h-5 w-5 shrink-0 border-2 ${
                    selected ? 'border-ink bg-signal-green' : 'border-line bg-ink'
                  }`}
                />
                <span className="min-w-0">
                  <span className="display-md block text-base">
                    {option.label}{' '}
                    <span className="text-sm opacity-60">
                      {countrySetSize(option.value)}
                    </span>
                  </span>
                  <span
                    className={`mt-1 block text-sm ${selected ? 'text-ink/70' : 'text-paper-dim'}`}
                  >
                    {option.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <section className="mt-6 flex flex-col gap-px border-2 border-line bg-line">
        <Toggle
          label="Reduce motion"
          hint="Turns off flips and slides. Your system setting is respected either way."
          checked={settings.reducedMotion}
          onChange={(value) => updateSettings({ reducedMotion: value })}
        />
        <Toggle
          label="Sound"
          hint="Play a sound on each answer."
          checked={settings.sound}
          onChange={(value) => updateSettings({ sound: value })}
        />
      </section>

      {/* §3.3 — short, neutral, and shown before anyone has to ask. */}
      <section className="mt-10">
        <h2 className="display-md text-xl text-paper">About the country list</h2>
        <p className="mt-3 max-w-prose text-paper-dim">
          This app includes territories, dependencies and disputed regions alongside
          sovereign states, because they are all things people want to learn. Their
          inclusion is not a statement about sovereignty, and neither is the way any of
          them is named or grouped. Quizzes start on{' '}
          <strong className="text-paper">UN countries</strong> — the {unMembers} member
          states plus Palestine and Vatican City — and you can widen that above, or per
          game on any setup screen.
        </p>
        <p className="mt-3 max-w-prose text-paper-dim">
          Where a country has more than one capital, all of them are accepted and the
          reason for each is shown when you review your answers.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="display-md text-xl text-paper">Your data</h2>
        <p className="mt-3 max-w-prose text-paper-dim">
          Everything is stored on this device only. Nothing is sent anywhere, and there
          is no account.
        </p>

        {loadStatus === 'corrupt' && (
          <p className="mt-3 border-l-4 border-signal-yellow bg-ink-raised px-4 py-3 text-sm text-paper">
            Your saved stats could not be read, so this started fresh. The unreadable
            data has been kept aside rather than deleted.
          </p>
        )}
        {loadStatus === 'future-version' && (
          <p className="mt-3 border-l-4 border-signal-yellow bg-ink-raised px-4 py-3 text-sm text-paper">
            Your saved stats were written by a newer version of this app, so they
            haven&rsquo;t been loaded. They&rsquo;ve been left untouched.
          </p>
        )}

        {confirmingReset ? (
          <div className="mt-4 border-2 border-wrong bg-ink-raised p-4">
            <p className="text-paper">
              Delete every score, streak and per-country record? This cannot be undone.
            </p>
            <div className="mt-4 flex flex-col gap-px sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  resetAll();
                  setConfirmingReset(false);
                }}
                className="label-caps bg-wrong px-5 py-3 text-sm text-paper"
              >
                Yes, delete everything
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="label-caps bg-ink px-5 py-3 text-sm text-paper"
              >
                Keep my data
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="label-caps mt-4 border-2 border-wrong px-5 py-3 text-sm text-wrong transition-colors hover:bg-wrong hover:text-paper"
          >
            Reset all data
          </button>
        )}
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 bg-ink-raised p-4 has-[:focus-visible]:outline-3 has-[:focus-visible]:-outline-offset-3 has-[:focus-visible]:outline-signal-yellow">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-1 flex h-6 w-11 shrink-0 items-center border-2 transition-colors ${
          checked ? 'justify-end border-signal-green bg-signal-green' : 'justify-start border-line bg-ink'
        }`}
      >
        <span className="block h-4 w-4 bg-paper" />
      </span>
      <span className="min-w-0">
        <span className="display-md block text-base text-paper">{label}</span>
        <span className="mt-1 block text-sm text-paper-dim">{hint}</span>
      </span>
    </label>
  );
}
