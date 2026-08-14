# Progress

Ticket tracker for the build plan. Tick items as they complete; record deviations
and blockers underneath the relevant ticket.

Gate for every ticket: `npm run typecheck && npm run lint && npm run test`.

## Phase 0 — Foundations

- [x] **T0.1** — Project scaffold
- [x] **T0.2** — Entity schema
- [x] **T0.3** — Data pipeline
- [x] **T0.4** — Flag assets
- [x] **T0.5** — FlagImage component

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

### T0.3 — Data pipeline

250 entities: 193 UN members, 2 observers, 3 partially-recognised, 2 SARs, 50
dependencies. Build is deterministic — verified by running it three times and
comparing SHA-256 of both outputs.

**Source deviation, worth knowing about.** The plan says "a snapshot of REST
Countries". The REST Countries HTTP API now returns a deprecation stub for
every version, so nothing can be fetched from it. Instead the build reads the
`world-countries` npm package, which *is* the mledoze/countries dataset that
REST Countries serves — the same data, committed as a dependency rather than
fetched. That also satisfies the "runs twice, identical output" criterion
better than a live fetch would. Natural Earth is not used: nothing in the v1
entity schema needs geometry.

**Real errors found in the source and corrected in `overrides.json`:**

- The snapshot marks **Vatican City as a UN member**, giving a UN count of 194.
  It is a permanent observer. Corrected, and the dataset test now pins the
  count at 193 so this cannot regress.
- The snapshot gives **Hong Kong**'s capital as "City of Victoria", a historic
  name. An SAR has no capital, so its `capitals` is emptied — which removes it
  from capitals and combo pools through the filter, per locked decision 4.
- **Bolivia, Sri Lanka, Netherlands, Eswatini and Benin** each carry only one
  capital in the snapshot. All now carry both, with notes.

**Shared flags — the check the obvious implementation misses.** §3.3 asks for
identical flags to be marked. Grouping by *filename* finds nothing, because
flag-icons ships a separate file per entity. Grouping by *artwork* (hashing the
SVG with its generated `id` attributes stripped) finds four groups, one of them
nine entities wide: France, French Guiana, Guadeloupe, Mayotte, Réunion, Saint
Barthélemy, Saint Martin, Saint Pierre and Miquelon and Wallis and Futuna all
fly the same tricolour. Without this, a flag question could offer three of them
as separate options and be unanswerable. `flag.sharedWith` is populated from
the artwork grouping and T1.2 will honour it.

**Not populated: `population`.** The snapshot carries no population figures.
Rather than invent 250 numbers the field is left unset — it is optional in the
schema and nothing in v1 reads it. Flagged here because §3.1 lists it.

**`tier` is a heuristic, not sourced data.** Rule is stated in `overrides.json`
under `$tierOne` and repeated in `data-report.md`: curated familiar entities
plus UN members over 300,000 km² are tier 1; dependencies, SARs and anything
under 1,000 km² are tier 3; the rest tier 2. Nothing in v1 depends on it yet.

**Deviation from the ticket text:** the flag *copy* happens in this script
rather than in T0.4, because `flag.aspectRatio` and `flag.colours` are read
back off the real asset — deriving them requires the files to be in hand. T0.4
covers licences, the CREDITS file and the on-disk assertions.

### T0.4 — Flag assets

**No flag could not be sourced.** The plan budgets half a day for hand-sourcing
non-ISO entities from Wikimedia, but flag-icons turns out to ship all 250,
Kosovo included (under the user-assigned code `XK`). So 249 of 250 assets are
one MIT licence with no per-file provenance to track.

**One asset was wrong rather than missing.** flag-icons ships the plain Union
Jack under the code `sh`. Saint Helena's flag is a Blue Ensign carrying the
territory's shield, so that asset was both factually wrong *and* identical to
the United Kingdom's — the shared-artwork check is what surfaced it. Replaced
with the Commons file (public domain, Patricia Fidi, xrmap collection),
verified through the Commons API before use rather than assumed.

That added a small asset layer worth having anyway: `data/hand-sourced/` holds
the file plus a manifest recording source, licence, author and the reason it
exists, and the build prefers it over flag-icons and generates
`public/flags/CREDITS.md` from it. Adding another hand-sourced flag is now a
file plus a manifest entry, and the build refuses an asset whose manifest entry
names a different entity.

Side effect: the dataset now has three genuine aspect ratios — 1:1
(Switzerland, Vatican City), 4:3 (the flag-icons bulk) and 2:1 (Saint Helena)
— so T0.5 has real cases to render rather than contrived ones.

**Known limitation, not a blocker.** flag-icons normalises its artwork to 4:3,
so flags whose official ratio is something else (Qatar's 28:11, Nepal's
non-rectangular pennant, the many 1:2 flags) are drawn to fit a 4:3 box rather
than reproduced at their true proportions. `flag.aspectRatio` therefore
describes *the shipped asset*, which is what FlagImage needs to render without
distortion — it is deliberately not a claim about the official ratio. Fixing
this properly means hand-sourcing ~250 true-ratio SVGs, which is a data project
of its own; the manifest layer above is the seam to do it through, one flag at
a time, without touching any other code.

### T0.5 — FlagImage component

`revealName` is a required prop with no default, so a caller that forgets it
gets a type error rather than quietly leaking the answer. While it is false the
component emits generic alt text and **no `title`** — a title would surface the
country on hover and through some assistive tech.

**A trap worth recording: `toHaveStyle` on `aspect-ratio` is vacuous under
jsdom.** jsdom does not implement the property and drops it from the CSSOM, so
`expect(el).toHaveStyle({ aspectRatio: '999' })` passes against an element
whose ratio is `2`. The first version of these tests was green while asserting
nothing. The component now mirrors the ratio onto `data-aspect-ratio` and the
tests assert that instead. Any future test touching a modern CSS property
should be checked the same way — assert a deliberately wrong value first and
confirm it fails.

Because jsdom has no layout engine, "renders without distortion" cannot be
tested there at all. Verified separately in real Chromium by measuring the
painted image box against the SVG's natural ratio at a fixed 240px container
width: 1:1, 4:3 and 2:1 all painted at zero distortion. The Playwright suite
picks this up at the Phase 1 gate.

`playwright.config.ts` now detects a preinstalled Chromium under
`PLAYWRIGHT_BROWSERS_PATH` whose revision differs from the one this Playwright
version manages, and falls back cleanly when there isn't one.
