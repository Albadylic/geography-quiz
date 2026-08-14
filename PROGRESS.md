# Progress

Ticket tracker for the build plan. Tick items as they complete; record deviations
and blockers underneath the relevant ticket.

Gate for every ticket: `npm run typecheck && npm run lint && npm run test`.

## Phase 0 — Foundations

- [x] **T0.1** — Project scaffold
- [x] **T0.2** — Entity schema
- [ ] **T0.3** — Data pipeline
- [ ] **T0.4** — Flag assets
- [ ] **T0.5** — FlagImage component

## Phase 1 — Flag mode

- [ ] **T1.1** — Seeded RNG
- [ ] **T1.2** — Question generation
- [ ] **T1.3** — Session and scoring
- [ ] **T1.4** — Setup screen
- [ ] **T1.5** — Play screen
- [ ] **T1.6** — Basic results _(phase gate: Playwright 20-question easy flags quiz)_

## Phase 2 — Capitals and Expert

- [ ] **T2.1** — Text matching
- [ ] **T2.2** — Autocomplete component
- [ ] **T2.3** — Capitals mode
- [ ] **T2.4** — Expert difficulty

## Phase 3 — Persistence and summaries

- [ ] **T3.1** — Storage
- [ ] **T3.2** — Stats recording
- [ ] **T3.3** — Results screen
- [ ] **T3.4** — Stats screen
- [ ] **T3.5** — Settings

## Phase 4 — Combo mode

- [ ] **T4.1** — Dual-answer question type
- [ ] **T4.2** — Combo UI and its own high score entry

## Phase 5 — Adaptive and Revision

- [ ] **T5.1** — Weighting
- [ ] **T5.2** — Hardest-countries pool
- [ ] **T5.3** — Leitner scheduling
- [ ] **T5.4** — Flashcards

## Phase 6 — Colour the Flag

- [ ] **T6.1** — Template format and first 6 templates
- [ ] **T6.2** — Colouring specs for ~60 entities
- [ ] **T6.3** — Painting UI
- [ ] **T6.4** — Palette difficulty and grading
- [ ] **T6.5** — Expand to 14 templates and ~120 entities

## Phase 7 — Polish

- [ ] **T7.1** — Accessibility pass
- [ ] **T7.2** — Responsive audit
- [ ] **T7.3** — Empty, loading and error states
- [ ] **T7.4** — Performance
- [ ] **T7.5** — PWA groundwork

---

## Notes, deviations and blockers

### T0.1 — Project scaffold

Stack as specified: Vite 8 + React 19 + TS 5.9 (`strict`), Tailwind 4 (via
`@tailwindcss/vite`), React Router 7, Zustand 5, Vitest 4 + Testing Library,
Playwright.

Choices made inside the latitude the plan leaves:

- **TypeScript 5.9, not 7.x.** `typescript-eslint` peers `typescript <6.1.0`, so
  the current TS 7 release is not yet usable with the lint stack.
- **Import boundary via `no-restricted-imports`** scoped to `src/engine/**`
  rather than an extra plugin dependency. It blocks `features/`, `components/`,
  `store/`, `storage/` and `routes/` in both alias (`@/features/...`) and
  relative (`../features/...`) form, and separately blocks React/Zustand so the
  engine stays framework-free. Verified by probe: a file importing
  `@/features/home/HomeScreen` and `react` produces two lint errors.
- **`tsc --noEmit` over a single tsconfig** covering `src`, `scripts` and `e2e`,
  rather than project references — one strictness setting for the whole repo.
  `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on, which is
  stricter than the plan requires but catches exactly the option-array and
  optional-field mistakes this app invites.
- **System font stacks, no webfont.** §10 asks for a grotesque display face
  against a neutral body face; a fetched webfont would undercut the offline
  goal in Phase 7, so the display face is a Helvetica/Arial-Black stack set in
  heavy weight with tight tracking, and the body face is the system UI stack.

### T0.2 — Entity schema

Types are **derived from** the Zod schema (`z.infer`) rather than declared
twice, so a field cannot drift between the runtime check and the type.

Additions beyond the §3.1 listing, all of them things the dataset needs to be
able to express and the build needs to be able to check:

- `flag.sharedWith` — §3.3 requires that dependencies flying their sovereign's
  flag are "flagged in data" so two identical flags never land in one option
  set. There was no field for it, so this is it.
- `COLOUR_TOKENS` — the closed token set §7 grading depends on, defined here
  because both the flag palette and the colouring spec draw from it.
- `EntityListSchema` — the cross-entity invariants a per-entity schema cannot
  see: duplicate ids, duplicate names, and reference integrity for
  `sovereignId`, `confusableWith` and `flag.sharedWith`. This is what the §12
  data tests assert against.
- `.strict()` on the entity object, so a typo'd key in `overrides.json` fails
  the build instead of being silently dropped.
