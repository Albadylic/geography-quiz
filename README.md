# Geography Quiz

A browser quiz for learning the countries of the world: their flags, their
capitals, and — in one mode — how to colour a flag in from memory.

Everything runs in the browser and everything is stored on the device. There is
no account, no server, and nothing is sent anywhere.

## Modes

| Mode | What it asks |
| --- | --- |
| **Flags** | Match the flag to the country, or the country to the flag |
| **Capitals** | Name the capital, or name the country from its capital |
| **Combo** | One country, two questions: its flag and its capital, scored separately |
| **Colour the flag** | Fill in a blank flag from memory, region by region |
| **Revision** | Flashcards with Leitner scheduling. No score, no timer |

Four difficulties: easy, medium and hard change how many options you get (4, 6,
8), and expert asks you to type the answer. Easy also biases towards countries
you are likely to have heard of.

You choose which countries are in play, per game:

| Set | Count |
| --- | ---: |
| UN countries — the 193 members plus Palestine and Vatican City | 195 |
| Plus disputed — adds Kosovo, Taiwan and Western Sahara | 198 |
| Everything — adds territories, dependencies and SARs | 250 |

## Getting started

```sh
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built app |
| `npm run typecheck` | `tsc -b --noEmit` over `src`, `scripts` and `e2e` |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run test:e2e` | Playwright — builds the app itself first |
| `npm run build:data` | Regenerate the dataset. **Run deliberately** — see below |
| `npm run measure:loading` | Time a cold and warm load over a throttled link |

The gate before anything is considered done is
`npm run typecheck && npm run lint && npm run test`, plus `npm run test:e2e`.
CI runs all of it on every push.

## How it fits together

```
src/engine/     pure quiz logic — no React, no storage, no DOM
src/features/   one directory per screen
src/components/ shared UI
src/store/      Zustand stores; they call the engine and hold what it returns
src/storage/    localStorage behind an adapter, with versioned migrations
src/data/       the generated dataset, the Zod schema, the flag templates
scripts/        the data pipeline
```

**The engine boundary is enforced, not just intended.** `src/engine/**` may not
import from `features/`, `components/`, `store/`, `storage/` or `routes/`, and
may not import React or Zustand. An ESLint rule fails the build if it does. The
point is that anything deciding what is correct or how much it scores stays
testable without a DOM, and stays in one place.

Anything random goes through a seeded PRNG in `src/engine/rng.ts`. Nothing in
the engine calls `Math.random()`, so a quiz is reproducible from its seed.

### The dataset is generated, and deliberately not automatic

`src/data/entities.generated.ts` is built by `npm run build:data` from a
committed `world-countries` snapshot plus `data/overrides.json`, and is checked
in. It is **not** part of `npm run build`: a dataset that regenerated on every
build could change what the tests are testing without anyone deciding to. Run it
when you have edited `data/overrides.json` or bumped the source, look at the
diff, and commit it. CI fails if the committed dataset does not match its
sources.

Every manual override, every warning, and every field that is derived rather
than sourced is written to `data-report.md` by the same run.

## Deploying

The app uses history routing, so the server must return `index.html` for paths
it has no file for — otherwise `/stats` and any shared `/results/:id` link 404.

- **Netlify, Cloudflare Pages** — `public/_redirects` is already in place.
- **GitHub Pages** — the build writes `dist/404.html`, which Pages serves for
  unknown paths. Nothing else needed.
- **nginx** — `location / { try_files $uri $uri/ /index.html; }`
- **Apache** — `FallbackResource /index.html`
- **S3 / CloudFront** — set both the index and error documents to
  `index.html`.

A service worker precaches the shell and caches flags as they are used, so a
second visit works offline. Its cache version is derived from the built asset
hashes, so a new deploy replaces the old cache rather than stranding it.

## Data and licensing

Country data comes from the [`world-countries`](https://github.com/mledoze/countries)
snapshot — the dataset REST Countries is built from — layered with corrections
in `data/overrides.json`, each one recorded in `data-report.md`.

Flags are from [flag-icons](https://github.com/lipis/flag-icons) (MIT), with a
small number hand-sourced; `public/flags/CREDITS.md` records the provenance and
licence of every one.

The country list includes territories, dependencies and disputed regions
alongside sovereign states, because they are all things people want to learn.
Their inclusion is not a statement about sovereignty, and neither is the way any
of them is named or grouped.

## Project history

`PROGRESS.md` is the build log: every ticket, every deviation from the plan, and
the reasoning behind decisions that are not obvious from the code — including
the ones that turned out to be wrong.
