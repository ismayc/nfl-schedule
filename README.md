# The NFL Schedule

[![CI](https://github.com/ismayc/nfl-schedule/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/nfl-schedule/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://the-nfl-schedule.netlify.app/coverage.json)](https://github.com/ismayc/nfl-schedule/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live:** [the-nfl-schedule.netlify.app](https://the-nfl-schedule.netlify.app) ·
[ismayc.github.io/nfl-schedule](https://ismayc.github.io/nfl-schedule/)

An unofficial viewer for the NFL season: every game in your timezone, week by week, live
scores, standings, the playoff bracket, and league leaders.

No backend, no API keys, no tracking. The whole app is a static bundle plus a committed
snapshot of the season — it renders a complete season with **zero requests on load**.

---

## Views

| View | What it does |
|---|---|
| 📋 **Schedule** | Every game grouped by the calendar day *you* see, opening on today — previous days are hidden behind a toggle. Filter by team or by the teams you follow. |
| 📆 **Week** | One NFL week at a glance, as day columns (Thu · Sat · Sun · Mon) rather than a long list — with the Sunday slate split by kickoff window (early, late, Sunday night). Page through weeks 1–18, and see who's on a bye. |
| 📊 **Standings** | By division (all eight, division winners marked) or by conference (seeded 1–16 with the playoff cutline). W-L-**T**, win %, points for/against and differential, home/road and division splits, streak. |
| 🏆 **Playoffs** | The single-elimination bracket — seven seeds per conference, the No. 1 seed's bye, re-seeding every round, the two conferences converging on the Super Bowl. Projected from the standings until the field is set. |
| 📈 **Stats** | Season totals, league leaders across passing / rushing / receiving / defense, scoring margin, and the playoff race per conference. |

**Star a team** from any game card, standings row, or team panel to highlight it across
every view, filter the schedule to "My teams", and scope live alerts to it. Clicking any
team opens a **team panel** — splits, form, roster, and what's next. Plus: light/dark
themes, spoiler-free mode, shareable URLs, live alerts for notable moments, a game-detail
modal with a quarter line score and season series, `.ics` calendar export (whole season or
one team's), and installable-PWA support.

## Data

Everything comes from ESPN's public, keyless, CORS-open feeds.

**The season is committed, not fetched.** `scripts/fetch-schedule.mjs` generates
`src/data/schedule.js`, `src/data/teams.js`, and `src/data/leaders.js`, and mirrors team
logos into `public/logos/`. The app therefore renders a complete season with **zero
requests on load**. At runtime, ESPN's scoreboard is polled only to overlay games that are
live or just finished (every 30s while a game is in progress, 2 min otherwise, never once
the season ends).

That snapshot is refreshed by `.github/workflows/refresh-data.yml`, which regenerates the
data, runs the test suite against it, and opens a PR. Standings are *derived* from the
committed scores, so a bad refresh surfaces as a failing test rather than a quietly wrong
table.

### Three things about the NFL feed

1. **The week is a first-class field.** Every event carries `week.number`, so the schedule
   is organized by NFL week (1–18), not just by date. Preseason is skipped — its weeks
   restart at 1 and would collide with the regular season.
2. **Conference is in the teams feed; division is not.** Division membership (needed for
   seeding) comes from the standings tree at `level=3` — the default tree only nests
   conference → 16 teams.
3. **Ties are real.** The NFL is the only league in this family that records them. A tie
   counts as half a win (`pct = (w + ½t) / gp`); miscounting one as a loss would corrupt
   every derived seed.

With those handled, derived W-L-T, home/road splits, and division records match ESPN's
published standings exactly for all 32 teams.

### Seeding and the bracket

Two format details drive most of the postseason logic:

- **Seeding is by division, then record.** The four division winners take seeds 1–4; the
  next three teams by conference record are wild cards (5–7). A wild card can (and does)
  out-record a division winner and still seed below it.
- **A playoff slot is a single game, not a series.** The No. 1 seed earns a first-round
  bye, and every round **re-seeds** — the top remaining seed always hosts. Two conference
  brackets converge at the Super Bowl.

### Scoring frequency

Like basketball, football is too high-frequency to enumerate every score as an event, so
the model stores a final score plus a **quarter line score**, and player leaderboards come
from pre-aggregated season stat lines rather than being summed from events. The live badge
shows the **quarter** (`Q3`, `OT`) rather than a running clock a 30-second poll can't keep
honest, and alerts surface moments that change how a game *feels* — kickoff, a lead change,
a one-score fourth quarter (within 8), and the final — by diffing poll snapshots.

## Develop

```bash
npm install
npm run dev              # local dev server
npm test                 # unit + render tests
npm run test:coverage    # tests with coverage (100% enforced)
npm run build            # production bundle
npm run coverage:badge   # tests with coverage, writes public/coverage.json

npm run fetch:schedule   # regenerate committed data from ESPN
npm run check:schedule   # report drift between committed data and the live feed
npm run verify:live      # check the live overlay's assumptions against a game in progress
```

`scripts/` uses **Node built-ins and relative imports only** — no `node_modules` imports —
so CI can run the data jobs on a bare checkout with no install step. A CI job enforces it.

### Testing approach

The suite leans on real data rather than hand-made fixtures, because real data contains the
edge cases you wouldn't think to invent. Coverage is enforced at **100%** in CI
(`vite.config.js` thresholds), so an untested branch fails the build.

- **Standings** are derived from a real completed season (`test/fixtures/season-2025.js`)
  and checked to match ESPN's published W-L-T for all 32 teams.
- **The bracket** is tested against the complete 2025 postseason — 13 games — because the
  2026 bracket doesn't exist until January. It reproduces the real outcome, champion and
  all. That fixture caught a seeding/bracket coupling bug a synthetic test would have sailed
  past.
- **Empty-season states** matter here: the committed 2026 snapshot has no games played yet,
  so every view is tested in both its populated and empty forms.

One gap the suite structurally cannot close: the live overlay's field mapping was inferred
from completed and scheduled games, and the tests mock ESPN using the same inferences — so
they agree by construction. `npm run verify:live`, run during a game, is the only check that
compares those assumptions to reality.

## Deploy

Built with `base: './'`, so the same `dist/` works at a domain root (Netlify) and under a
subpath (GitHub Pages `/nfl-schedule/`) with no separate build.

- **GitHub Pages** deploys automatically from `ci.yml` on every push to `main`, gated on
  tests passing.
- **Netlify** deploys via its own GitHub integration (it builds from `netlify.toml` on each
  push), with deploy previews on pull requests.

## Credits

Created by [Chester Ismay](https://chester.rbind.io). Source on
[GitHub](https://github.com/ismayc/nfl-schedule).

Unofficial fan project. Not affiliated with, endorsed by, or sponsored by the NFL. Team
names and logos are trademarks of their respective owners. Schedule, results, and player
data via ESPN's public feeds.

MIT licensed.
