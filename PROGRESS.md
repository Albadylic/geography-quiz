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

- [x] **T1.1** — Seeded RNG
- [x] **T1.2** — Question generation
- [x] **T1.3** — Session and scoring
- [x] **T1.4** — Setup screen
- [x] **T1.5** — Play screen
- [x] **T1.6** — Basic results _(phase gate: Playwright 20-question easy flags quiz)_

## Phase 2 — Capitals and Expert

- [x] **T2.1** — Text matching
- [x] **T2.2** — Autocomplete component
- [x] **T2.3** — Capitals mode
- [x] **T2.4** — Expert difficulty

## Phase 3 — Persistence and summaries

- [x] **T3.1** — Storage
- [x] **T3.2** — Stats recording
- [x] **T3.3** — Results screen
- [x] **T3.4** — Stats screen
- [x] **T3.5** — Settings

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

### T1.1 — Seeded RNG

mulberry32 plus `shuffle` (Fisher–Yates), `sample`, `pick` and
`weightedSample`. `randomSeed()` is the single place a non-seeded random is
allowed; everything else in the engine takes an `Rng`.

`weightedSample` uses the A-Res / exponential-jump method — each item keyed by
`rng^(1/weight)`, top `count` keys win — which is one pass and equivalent to
repeated weighted draws without replacement. It back-fills zero-weight items
rather than returning a short list, so §8's Hardest mode still fills a session
when a user has very few weak entities.

The §12 criterion "shuffle is uniform over 10k trials within tolerance" was
checked for teeth the same way as T0.5: a deliberately biased shuffle (drawing
`j` from `[0, length)` instead of `[0, i]` — the standard mistake) was run
through the same assertion and exceeded the tolerance, confirming the test can
fail.

### T1.2 — Question generation

`engine/pool.ts` (filtering, capping) and `engine/questions.ts` (selection, the
distractor ladder). Deterministic in the seed: same seed produces byte-identical
questions, options and order.

**Two judgement calls in the ladder, both deliberate.**

1. **`confusableWith` is only used when a flag is on screen.** It records
   *visual* flag similarity. Chad and Romania fly near-identical flags, but
   N'Djamena and Bucharest are not confusable at all — using that rung on a
   capitals question would pull a distractor in from another continent for no
   benefit, which is exactly what §6.2 warns against. Tested both ways: Chad's
   hard *flags* question offers Romania in 30 of 30 seeds; Chad's hard
   *capitals* question offers it in 0 of 30.

2. **The last rung is always "anywhere in the pool".** §6.2 says capital
   distractors *must* be same-continent at medium+, but Oceania and South
   America cannot always fill eight slots from their own continent. Ordering
   the tiers means the fallback is only reached when the near tiers are
   exhausted, so the rule holds wherever it can and a thin continent still gets
   a full option set instead of a short one. The test pins the off-continent
   rate below 2% rather than at zero, which is the honest bound.

**The shared-flag guard is not theoretical.** A builder that fills from the
ladder without checking `flag.sharedWith` produces **36 clashing pairs** across
a full 250-question hard flags run — Mayotte and Réunion are both Eastern
Africa *and* both fly the French tricolour, so they collide through the
same-subregion rung, not some exotic path. With the guard: 0. Measured both
ways before trusting the test.

**Interpretation of `Question.correctIds`** (§5.1 says "> 1 where multiple
capitals are acceptable"): options and correctIds both hold *entity* ids, and a
capital option is labelled with that entity's **primary** capital. That is what
keeps Cape Town from appearing as a distractor against South Africa, which
would be unanswerable. Multi-capital acceptance therefore lives in expert-mode
grading (T2.4), where the answer is free text and any listed capital counts —
so `correctIds` is length 1 for multiple choice. Raised here because it is a
narrower reading than the plan's wording implies.

### T1.3 — Session and scoring

`engine/session.ts` plus `engine/grading.ts` (multiple choice only; free text
arrives in T2.1). Sessions are immutable values — `answerQuestion` returns a
new session — so the store can hold one, the results screen can read it after
navigation, and tests can replay a scripted run.

The scripted 20-answer test computes its expected total by hand rather than
snapshotting whatever the code produced: 12 correct on easy is 120 base, and
the streak bonus lands on the 5th, 6th and 7th of a seven-run plus the 5th of a
five-run, so 124. A perfect 20 is 234. Both hold.

`recordAnswer` is split out from `answerQuestion` so expert mode (T2.4) and
combo mode (T4.1), which decide correctness differently, reuse the scoring and
advance logic rather than reimplementing the streak.

Locked decision 5 is covered by an actual test, not just by omission: the
serialised session is asserted to contain no duration/elapsed/timing key, and
each recorded answer is asserted to have exactly the three keys §5.1 lists.

`configSignature` deliberately **excludes the seed** — the seed identifies one
particular quiz, not a category of achievement, so two runs of the same setup
compete for the same high score. Continents are sorted so a Europe+Asia run
signs the same as an Asia+Europe one.

### T1.4 — Setup screen

Direction, difficulty, length and continents, with the pool summary recomputed
live and the cap message shown *before* Start, per §5.2 step 2. Combo hides
direction and difficulty since §6.3 fixes both.

`ChoiceGroup` uses real `<input type="radio">` elements rather than buttons
with `role="radio"`, so arrow-key navigation and the single-tab-stop-per-group
behaviour come from the platform. The inputs are visually hidden, so the focus
ring is drawn on the label with `has-[:focus-visible]:`.

**A real bug the acceptance test caught.** The first version rendered all seven
continents as checked while "Everywhere" was active, so clicking Oceania meant
*deselect Oceania* and produced a 223-country pool rather than a 27-country
one — the exact scenario the ticket asks about. "Everywhere" is now its own
choice with the individual continents unchecked, and clicking one from that
state selects just it. The checkbox state and the visual state also agreed
wrongly before: `aria-checked` was true while the swatch rendered unselected.

### T1.5 — Play screen

`OptionGrid` renders 4/6/8 options in two columns (§6.1), flags edge-to-edge as
tappable colour fields rather than thumbnails in cards (§10). Number keys 1–8
select, and the handler ignores keystrokes aimed at a text field so expert mode
can share the screen. Feedback carries an icon *and* a colour, and the
announcement names the right answer when the player got it wrong.

**Two React correctness fixes made before the tests could have caught them.**
The first version called the store's `answer()` from inside a `setChosenId`
updater — a side effect in an updater, which React may invoke twice — and set
the auto-advance timeout to a callback that closed over a stale `chosenId`. The
pending choice now lives in a ref that `advance` reads, so it cannot double-
answer and cannot advance with the wrong value. There is a test asserting
exactly one answer is recorded when Continue and the timer race.

**Fake timers had to be abandoned in the tests.** `vi.useFakeTimers()` with
userEvent's `advanceTimers` hung; because the hang happened while fake timers
were installed, the `finally` restoring them never ran and every later test in
the file timed out too. The auto-advance test now waits 1.2s for real. Slower,
but it tests the timing that actually ships and cannot poison its neighbours.

### T1.6 — Basic results

Score, accuracy, correct count and best streak, with the config rendered as
§9's readable line. `describeConfig` lives in `lib/format.ts` rather than
beside the component so the stats screen shares one implementation.

**Phase gate passed.** Four Playwright specs against the production build:
a full 20-question easy flags quiz to the results screen, the same run played
only from the keyboard, the Oceania cap message, and a measurement that the
prompt flag's painted box matches the SVG's natural ratio — the undistorted-
rendering check jsdom cannot make, since it has no layout engine.

One E2E selector lesson: `sr-only` inputs cannot be clicked by pointer, because
the visible label sits over them. A real user clicks the label and the browser
forwards it, so the component is right and the test targets label text.

**Noted for T7.4:** the production bundle is currently 473 KB raw / 133 KB
gzipped, over the plan's 400 KB initial-JS target. The 165 KB dataset is most
of it and is a good candidate for a lazy chunk. Not addressed here — it is
T7.4's ticket.

### T2.1 — Text matching

`lib/normalise.ts` (normalise, Levenshtein with an early cap, tolerance) and
the matcher in `engine/grading.ts`.

**⚠️ Deviation from §5.3, because §5.3 as written fails §12.** Worth a
decision from the product owner, though the resolution below satisfies both
sections and every named acceptance test.

§5.3 specifies: accept within edit distance 1 for inputs under 8 characters
and 2 for longer, and states that this rejects "Austria"/"Australia" because
they are "distance 3". **They are distance 2.** So the rule as written, applied
to the 9-character input "Australia", forgives up to 2 and grades it as
Austria — precisely the false positive §12 requires be rejected.

It is not an isolated arithmetic slip. The same rule accepts:

| typed | graded as | distance | tolerance |
| --- | --- | --- | --- |
| Australia | Austria | 2 | 2 |
| Iran | Iraq | 1 | 1 |
| Zambia | Gambia | 1 | 1 |

All three are real, different countries, and a quiz that marks "Iran" correct
when the answer is Iraq is not teaching anyone anything.

**Resolution kept the §5.3 tolerances unchanged and added one rule:** an input
that is *exactly* the name of some other entity is never treated as a
misspelling of this one. A typo produces a non-word; "Australia" is not a typo,
it is Australia. Ordering is exact match → reject-if-it-names-another → fuzzy.

That keeps every §12 case working — "Kyrgystan", "Ouagadoudou", "Cote d
Ivoire", "USA", "the netherlands" all accepted, "Australia" for Austria
rejected — and it is verified exhaustively rather than by example: a test walks
all 250×250 ordered pairs and asserts no country's name ever grades as any
other. Same for capitals.

**Capital names are not unique**, which the exhaustive test surfaced. Kingston
is the capital of both Jamaica and Norfolk Island; Oranjestad of both Aruba and
Sint Eustatius; Jerusalem is listed for both Israel and Palestine. Typing a
name the target genuinely holds is correct for either, so the test excludes
real shared names and asserts only that no *fuzzy* match crosses between
countries.

### T2.2 — Autocomplete component

Suggestion policy lives in `engine/suggest.ts`, not the component: how many,
how short a query is allowed, and when a lone suggestion may be shown are quiz
decisions. The component is the ARIA combobox around it — focus stays in the
input and the active option is pointed at with `aria-activedescendant`, so
arrow keys announce correctly instead of moving focus into the list.

**Two design corrections, both found by tests rather than reasoning.**

1. **Aliases match but are never displayed.** Excluding aliases outright meant
   someone who knows the country as "Côte d'Ivoire" typed "cote" and got
   nothing. Including them as *labels* would teach "Holland" as the answer.
   Matching on aliases while offering the canonical name does both jobs:
   "cote" and "holl" find their countries and are shown "Ivory Coast" and
   "Netherlands".

2. **Substring matching applies only to the displayed name, not to aliases.**
   With aliases included, "zim" suggested Comoros — its alias "Udzima wa
   Komori" contains "zim". The case substring matching exists for, "guinea"
   finding Papua New Guinea, is about the name itself.

**The lone-suggestion threshold had to come down from 4 to 3.** At 4, "fr"
offered France, "fra" offered *nothing* (France being the only match, the lone
result was withheld), and "fran" offered it again. A suggestion that vanishes
as you type reads as a broken input. The threshold is now exactly one above the
minimum query length, which still satisfies T2.2's criterion — verified
exhaustively over all 676 two-character queries in both answer kinds — and
there is a regression test asserting no suggestion ever disappears as more
characters are typed.

### T2.3 — Capitals mode

Both directions, with the same-continent distractor rule and the empty-capitals
exclusion already covered in the engine (T1.2). What this ticket added is the
screen wiring plus tests at the mode level.

The Antarctica test asserts the *mechanism*, not just the outcome: Antarctica
is absent from the capitals pool, its `capitals` array is genuinely empty, and
**every** entity dropped from the pool was dropped for that same reason — so
the exclusion cannot quietly become a hard-coded list (locked decision 4).

Tests that need a specific country search for a seed that produces it rather
than hard-coding one. A pinned seed would keep passing while silently testing a
different country if the dataset ever shifted.

### T2.4 — Expert difficulty

Free text wired into both modes. `PlayScreen` was refactored around a graded
`Answer` rather than a chosen option id, so multiple choice and free text share
one reveal-and-advance path — which is also what combo mode will need in T4.1.

**One case the plan does not mention: expert flags has only one direction.**
§6.1 gives flags mode a "country name → flag" direction and §6.2 makes expert
free text, but a flag cannot be typed. Expert flags questions are therefore
always flag → name; `supportsBothDirections` says so, generation enforces it,
and the setup screen replaces the direction control with a line explaining why
rather than offering a choice that silently does nothing.

Multi-capital feedback shows every accepted capital with its note after
answering, so a player who answered "Cape Town" learns why it was accepted and
what the other two are.

### T3.1 — Storage

`StorageAdapter` with a localStorage implementation and an in-memory one,
a versioned schema, and a migration runner that applies steps in order so a
payload arrives at the current version however far behind it is.

**v1 is not a hypothetical.** It is the shape Phase 1 of this build would have
written: flags only, so per-entity counts were a flat correct/wrong pair with
no mode split, and a high score was a bare number. The migration moves those
counts into `byMode.flags` — they can only have come from flags questions —
leaves capitals empty, and does **not** invent the accuracy, streak or
timestamp v1 never recorded.

Beyond the ticket, four failure modes are handled because the contract is
"nothing on disk may crash the app":

- Unparseable JSON, and valid JSON of the wrong shape.
- A payload from a **newer** build: not guessed at, and deliberately **not
  overwritten**, so going back to that build does not lose the user's data.
- A partially-written payload: missing fields are defaulted rather than the
  whole history being dropped.
- An adapter that throws. A test asserted this and found a real gap — the
  guards were inside `LocalStorageAdapter` only, so a throwing adapter
  propagated out of `load`. Now guarded at both levels.

Anything unreadable is moved to a quarantine key rather than deleted.

### T3.2 — Stats recording

Per-entity stats, high scores keyed by config signature, and streaks that carry
across sessions. All of it is pure functions in `engine/stats.ts`.

**A boundary problem worth recording.** The stat *shapes* were first written in
`storage/schema.ts`, which made `engine/stats.ts` import from `storage/` — and
the §4 lint rule correctly rejected it. The shapes are domain concepts §8
defines, so they moved into the engine and storage now imports them, adding
only a version number and settings. The stats functions are generic over
`StatsState`, so they take and return the persisted type unchanged.

Recording happens when the session finishes, in the store, not on the results
screen — so a run counts exactly once whether or not the player looks at their
results.

`statModeFor` records a question against **what it tested**, not the mode
selected: "which country has this capital" is a capitals question either way
round. Combo has no bucket of its own, and `outcomesFor` already splits its two
halves for T4.1.

### T3.3 — Results screen

Incorrect-answer review with the correct answer, what the player said, and the
flag with `revealName` — the one place alt text is supposed to name the country.

The first version showed the country name twice on flag → country questions
(as the heading and again as "Answer:"), which reads as a bug. The answer line
now appears only when it says something the heading does not.

### T3.4 — Stats screen

Per §9. The weakest-20 list is ordered by §8's smoothed error rate — the first
term of the adaptive weight — so a single wrong answer cannot outrank a country
missed five times. T5.1 replaces that ordering with the full weight including
recency. The Hardest link shows the plan's locked copy below 20 answered
questions.

### T3.5 — Settings

UN-members-only, reduced motion, sound, the neutral About copy from §3.3, and a
two-step reset. The UN toggle is wired through to `buildPool` as a filter on
`status`, verified by a test that watches the setup screen's pool count drop
from 250 to 193 — the dataset is untouched.

Settings also reports honestly when storage could not be read or came from a
newer build, rather than silently pretending the user had no history.

**Verified end to end in a real browser**, not only in jsdom: play a 20-question
run, reload the app completely, and the stats screen shows 20 questions, the
right accuracy, and the high score under its readable signature.
