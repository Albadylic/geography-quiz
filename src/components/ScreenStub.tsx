/**
 * Placeholder shell for routes whose feature ticket has not landed yet.
 * Every use of this is removed by the ticket named in `ticket`.
 */
export function ScreenStub({ title, ticket }: { title: string; ticket: string }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16">
      <h1 className="display-xl text-4xl text-paper">{title}</h1>
      <p className="mt-4 text-paper-dim">
        Not built yet — arrives in{' '}
        <span className="label-caps text-signal-yellow">{ticket}</span>.
      </p>
    </div>
  );
}
