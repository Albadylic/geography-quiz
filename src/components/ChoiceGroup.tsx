import { useId } from 'react';

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** Optional second line, e.g. "4 options". */
  hint?: string;
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  choices: ReadonlyArray<Choice<T>>;
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
}

/**
 * A segmented single-choice control.
 *
 * Real radio inputs rather than buttons with `role="radio"`: that gets arrow-key
 * navigation, form semantics and the "one tab stop per group" behaviour from
 * the platform instead of reimplementing them (§11).
 */
export function ChoiceGroup<T extends string>({
  legend,
  choices,
  value,
  onChange,
  columns = 2,
}: ChoiceGroupProps<T>) {
  const name = useId();
  const columnClass = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[
    columns
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="label-caps mb-2 text-xs text-paper-faint">{legend}</legend>
      <div className={`grid grid-cols-1 gap-px border-2 border-line bg-line ${columnClass}`}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <label
              key={choice.value}
              className={[
                'flex min-h-11 cursor-pointer flex-col justify-center px-4 py-3 transition-colors',
                // The input is visually hidden, so the focus ring has to be
                // drawn on the label the user actually sees (§11).
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-signal-yellow has-[:focus-visible]:-outline-offset-3',
                selected
                  ? 'bg-paper text-ink'
                  : 'bg-ink-raised text-paper hover:bg-ink-sunken',
              ].join(' ')}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={selected}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              <span className="display-md text-sm">{choice.label}</span>
              {choice.hint && (
                <span
                  className={`text-xs ${selected ? 'text-ink/70' : 'text-paper-faint'}`}
                >
                  {choice.hint}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
