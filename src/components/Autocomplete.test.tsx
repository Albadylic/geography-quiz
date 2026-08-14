import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Autocomplete } from './Autocomplete';
import type { AnswerKind } from '@/engine/types';

/** Wraps the controlled component so tests can drive it like a user would. */
function Harness({
  answerKind = 'name' as AnswerKind,
  onSubmit = () => {},
}: {
  answerKind?: AnswerKind;
  onSubmit?: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <>
      <Autocomplete
        label="Your answer"
        value={value}
        onChange={setValue}
        onSubmit={() => onSubmit(value)}
        answerKind={answerKind}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const input = () => screen.getByRole('combobox', { name: /your answer/i });
const options = () => screen.queryAllByRole('option');
const currentValue = () => screen.getByTestId('value').textContent;

describe('Autocomplete', () => {
  it('suggests nothing until two characters are typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(input(), 'f');
    expect(options()).toHaveLength(0);
    expect(input()).toHaveAttribute('aria-expanded', 'false');

    await user.type(input(), 'r');
    expect(options().length).toBeGreaterThan(1);
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows at most eight suggestions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'sa');
    expect(options().length).toBeLessThanOrEqual(8);
  });

  it('never shows a single suggestion for a two-character prefix (T2.2)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'zi');
    // Either several suggestions or none — never exactly the answer.
    expect(options()).not.toHaveLength(1);
  });

  it('moves through suggestions with the arrow keys without losing focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // "fr" matches several countries; "fra" matches only France.
    await user.type(input(), 'fr');

    await user.keyboard('{ArrowDown}');
    expect(input()).toHaveFocus();
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0]!.id);

    await user.keyboard('{ArrowDown}');
    expect(options()[0]).toHaveAttribute('aria-selected', 'false');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps around at both ends of the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'fr');
    const count = options().length;
    expect(count).toBeGreaterThan(1);

    await user.keyboard('{ArrowUp}');
    expect(options()[count - 1]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('selecting with Enter fills the input with the exact spelling', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'fran');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(currentValue()).toBe('France');
    expect(input()).toHaveValue('France');
  });

  it('selection is equivalent to typing the answer exactly (T2.2)', async () => {
    const user = userEvent.setup();
    const bySelection = vi.fn();
    const { unmount } = render(<Harness onSubmit={bySelection} />);
    await user.type(input(), 'fran');
    await user.keyboard('{ArrowDown}{Enter}');
    await user.keyboard('{Enter}');
    unmount();

    const byTyping = vi.fn();
    render(<Harness onSubmit={byTyping} />);
    await user.type(input(), 'France');
    await user.keyboard('{Escape}{Enter}');

    expect(bySelection).toHaveBeenCalledWith('France');
    expect(byTyping).toHaveBeenCalledWith('France');
  });

  it('selecting with the mouse fills the input', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'fran');
    await user.click(screen.getByRole('option', { name: 'France' }));
    expect(currentValue()).toBe('France');
  });

  it('Enter submits what was typed when nothing is highlighted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(input(), 'Frankreich');
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('Frankreich');
    expect(currentValue()).toBe('Frankreich');
  });

  it('Escape dismisses the list without clearing what was typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'fran');
    expect(options().length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(options()).toHaveLength(0);
    expect(currentValue()).toBe('fran');
  });

  it('reopens the list when typing continues after Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'fran');
    await user.keyboard('{Escape}');
    await user.type(input(), 'c');
    expect(options().length).toBeGreaterThan(0);
  });

  it('does not reopen the list right after a selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'fran');
    await user.keyboard('{ArrowDown}{Enter}');
    // The value is now exactly "France", which would otherwise match itself.
    expect(options()).toHaveLength(0);
  });

  it('suggests capitals when the answer is a capital', async () => {
    const user = userEvent.setup();
    render(<Harness answerKind="capital" />);
    await user.type(input(), 'par');
    expect(screen.getByRole('option', { name: 'Paris' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'France' })).toBeNull();
  });

  it('is labelled and announced as a combobox', () => {
    render(<Harness />);
    expect(input()).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.getByRole('listbox', { name: /suggestions/i })).toBeInTheDocument();
  });
});
