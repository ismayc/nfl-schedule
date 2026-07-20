# The NFL Schedule

An unofficial, timezone-aware viewer for the NFL season — the full schedule week by week,
live scores, conference standings, the playoff bracket, and league leaders. First paint is
instant and works offline: the whole season is committed as a static snapshot and rendered
with **zero network requests**, with a live overlay merged on top during games.

- **Live:** [the-nfl-schedule.netlify.app](https://the-nfl-schedule.netlify.app) · [ismayc.github.io/nfl-schedule](https://ismayc.github.io/nfl-schedule)
- Built on the shared [`sports-viewer-meta`](https://github.com/ismayc/sports-viewer-meta) framework — the fifth app in a family (world-cup, premier-league, WNBA, NBA, NFL).

## How it works

A build-time script (`scripts/fetch-schedule.mjs`) writes the entire season into
`src/data/*.js` from ESPN's public, keyless feeds. Standings, seeding, the bracket, and
stats are all **derived** from that committed snapshot — so a bad refresh fails a test
rather than quietly rendering a wrong table. At runtime the same scoreboard endpoint is
polled and merged over the top, joined on shared event ids.

Two rules keep the merge correct:

1. A score is written to the snapshot only for a **completed** game; in-progress scores are
   transient and belong to the live overlay.
2. The merge copies only **defined** values, so a feed omitting a field can never blank one
   the snapshot holds.

## NFL specifics

- **Week-first.** The Week view is a true Week 1–18 axis with bye-team tracking, not a
   calendar grid.
- **W-L-T standings.** Ties count as half a win (`pct = (w + t/2)/gp`) — the NFL is the
   only league in the family that records them.
- **Division-based seeding.** Four division winners take seeds 1–4; the next three by
   conference record are wild cards (5–7). Verified against ESPN's published seeds.
- **Single-elimination bracket.** The #1 seed earns a bye and every round re-seeds; two
   conference brackets converge on the Super Bowl.

## Commands

```bash
npm run dev              # local dev server
npm run build            # production build to dist/
npm test                 # vitest — includes standings/bracket checks vs a real 2025 fixture
npm run fetch:schedule   # regenerate src/data/* from ESPN (Node built-ins only)
npm run check:schedule   # diff the committed snapshot against the live feed
npm run verify:live      # check the live-overlay assumptions against a real in-progress game
```

## Data

Schedule, results, and player data via [ESPN](https://www.espn.com/nfl/). This is an
unofficial fan project, not affiliated with or endorsed by the NFL. Team names and logos
are trademarks of their respective owners.

Created by [Chester Ismay](https://chester.rbind.io). MIT licensed.
