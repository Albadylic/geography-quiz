import { useId, useMemo, useRef, useState } from 'react';
import type { Entity } from '@/data/schema';
import type { AnswerKind } from '@/engine/types';
import { suggest } from '@/engine/suggest';

interface AutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Submits the current value as the answer. */
  onSubmit: () => void;
  answerKind: AnswerKind;
  /**
   * The countries that can actually be the answer. Suggesting outside this set
   * offers answers the quiz cannot accept — in a UN-only game it was offering
   * Niue and Puerto Rico — and quietly contradicts the country set the player
   * chose. Omitted, the whole dataset is used.
   */
  pool?: readonly Entity[];
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Free-text answer box with suggestions — the expert-mode input (T2.2).
 *
 * Follows the ARIA combobox pattern: the input keeps focus throughout and the
 * active option is pointed at with `aria-activedescendant`, so arrow keys read
 * out correctly instead of moving focus into the list.
 *
 * All suggestion policy lives in `engine/suggest` — how many, how short a
 * query is allowed, and when a lone suggestion may be shown.
 */
export function Autocomplete({
  label,
  value,
  onChange,
  onSubmit,
  answerKind,
  pool,
  disabled = false,
  placeholder,
}: AutocompleteProps) {
  const inputId = useId();
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => (disabled || dismissed ? [] : suggest(value, answerKind, pool)),
    [value, answerKind, pool, disabled, dismissed],
  );
  const open = suggestions.length > 0;
  const active = activeIndex >= 0 ? suggestions[activeIndex] : undefined;

  const commit = (label: string) => {
    onChange(label);
    setActiveIndex(-1);
    setDismissed(true);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        if (!open) return;
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
        return;
      case 'ArrowUp':
        if (!open) return;
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
        return;
      case 'Enter':
        event.preventDefault();
        // Enter takes the highlighted suggestion if there is one, and
        // otherwise submits exactly what was typed.
        if (active) commit(active.label);
        else onSubmit();
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setDismissed(true);
          setActiveIndex(-1);
        }
        return;
      default:
    }
  };

  return (
    <div className="relative">
      <label htmlFor={inputId} className="label-caps mb-2 block text-xs text-paper-faint">
        {label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        role="combobox"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        {...(active ? { 'aria-activedescendant': `${listId}-${activeIndex}` } : {})}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(-1);
          setDismissed(false);
        }}
        onKeyDown={onKeyDown}
        className="w-full border-2 border-line bg-ink-raised px-4 py-4 text-lg text-paper placeholder:text-paper-faint focus:border-signal-yellow disabled:text-paper-faint"
      />

      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        className={open ? 'mt-px flex flex-col gap-px border-2 border-line bg-line' : 'hidden'}
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.entityId}-${suggestion.label}`}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            className={[
              'cursor-pointer px-4 py-3 text-base',
              index === activeIndex ? 'bg-paper text-ink' : 'bg-ink-raised text-paper',
            ].join(' ')}
            // mousedown rather than click: click fires after blur, which would
            // close the list before the selection lands.
            onMouseDown={(event) => {
              event.preventDefault();
              commit(suggestion.label);
            }}
          >
            {suggestion.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
