import { useState } from 'react';
import { entities } from '@/data/entities.generated';
import { useStatsStore } from '@/store/statsStore';

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

      <section className="mt-8 flex flex-col gap-px border-2 border-line bg-line">
        <Toggle
          label="UN members only"
          hint={`Quiz on the ${unMembers} UN member states rather than all ${entities.length} countries and territories.`}
          checked={settings.unMembersOnly}
          onChange={(value) => updateSettings({ unMembersOnly: value })}
        />
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
          them is named or grouped. If you would rather practise only the {unMembers} UN
          member states, turn on <strong className="text-paper">UN members only</strong>{' '}
          above.
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
