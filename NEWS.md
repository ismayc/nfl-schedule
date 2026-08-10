# NEWS

A dated changelog for The NFL Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-10

- **The ESPN fetch layer is now vendored, not copy-pasted.** The hardened
  transport (5 retries with exponential backoff + jitter, retry only on
  5xx/429/network errors, a 6-request concurrency cap) previously lived as an
  inline copy in each data script; it now lives in `scripts/lib/fetch.mjs`,
  vendored byte-for-byte from the canonical copy in `sports-viewer-meta`
  (which diffs every repo's copy via `check-fetch-sync`). No behavior change
  to the refresh pipeline.
- **Logo mirroring now retries too.** The crest/logo downloads previously used a
  bare `fetch` with no retry — a lone transient ESPN 500 could skip a logo (or
  fail the run). They now go through the same `fetchRetry` policy as the data
  fetches, with the concurrency cap applied.

## 2026-08-09

- **Game leaders will actually populate this season.** The refresh read
  per-game top performers from `competitors[].leaders`, where the basketball
  scoreboards put them — but the NFL scoreboard carries them at the
  COMPETITION level (one game-wide top per category), so no game ever got its
  stars and the detail modal's Game leaders block was dead. The parse now
  reads `competition.leaders` and resolves each leader's team through its id;
  verified against a real 2025 slate (13/13 games produce all three
  categories, e.g. Darnold 20/30 249 3 TD for SEA @ ATL). Takes effect with
  the first completed 2026 games.
- **Sunday Ticket badge is honest, refresh is safer, season self-names.** The
  Sunday Ticket service matched every CBS/FOX game including the six national
  telecasts (Thanksgiving, Christmas) that every market already gets — it now
  uses the regional Sunday-afternoon window test, so only the out-of-market
  slate badges. The refresh script's shrink guard now runs before ANY file is
  written (a refusal used to leave a fresh teams.js beside a stale
  schedule.js), and the season number derives from the date (rolling back in
  Jan–Feb) instead of a hardcoded `--season 2026` that would silently fetch
  the wrong year next season.
- **Leaderboards actually cover the league now.** The ESPN `byathlete` feed
  with no `sort=` returns only qualified passers (~53 rows, all QBs), so every
  non-passing board in the archived seasons was garbage — rushing led by the
  579th rusher, zero sack leaders. `fetchLeaders` now makes one request per
  board-defining stat (`sort=<category>.<stat>:desc`, the interceptions
  category camelCased — the lowercase form matches nothing) and merges by
  athlete id. Sacks and tackles-for-loss keep their half-credit decimal
  (Hendrickson's 17.5 was rounding to 18). All five archived seasons
  regenerated and verified against the historical record (Saquon 2005,
  Chase 1708/127, Kupp 1947/145, Watt 22.5, Diggs 11).

- **Finish column and real clinch flags.** The conference standings now carry a
  Finish column — the final seeds still arithmetically possible for each club
  (gold single number once locked) — and the race flags are computed for real:
  ✓ div for a clinched division title, ✓ for a banked playoff berth, ✕ for
  arithmetic elimination (row dims), replacing the old current-8th-seed
  approximation. The math runs on half-points (a tie is half a win) and honors
  NFL winner precedence — a 9-8 division champion seeding above a 12-5 wild
  card — by decomposing every bound on the division race; head-to-head ties are
  discounted once a season series is complete and strictly won. A scenario
  engine (`raceScenarios.js`, ported from the NBA/WNBA siblings with three-way
  win/loss/TIE branching) additionally proves late-season wild-card clinches
  the independent bounds miss: rivals who still play each other cannot all win
  out. Elimination stays purely arithmetic, and a tie owned by the multi-club
  tiebreakers (like a three-way division tie at 8-9) is honestly left unflagged.
  Verified against the completed 2025 season: every decided seed locks, all 14
  field/eliminated calls match, and the tiebreaker-owned NFC South stays open.

## 2026-08-08

- **Official NFL tie-breaking procedures.** Standings and seeding now implement
  the league's published tiebreakers in full, replacing the documented pairwise
  approximation: division and wild-card step chains (head-to-head, division,
  common games — with the wild-card-only minimum of four, conference record,
  strength of victory/schedule, combined scoring rankings, net points), the
  three-plus-club reduction with the official restart rule, the one-club-per-
  division wild-card elimination under a frozen division order, the
  head-to-head sweep, and full repetition of the procedure for each wild-card
  slot. Net touchdowns is a documented skip (the data carries final scores
  only); the coin toss is a deterministic alphabetical stand-in. 2025 seeding
  now matches the league on all 14 field positions (the SF/LAR wild-card order
  was the old miss). Every step is locked by a synthetic fixture that fails if
  that step is removed.
- **Standings legend.** The Regular Season tab now spells out its markers below
  the tables — ♛ leading the division (top-4 seed, home playoff game), ★ a
  followed team — instead of relying on hover-only tooltips.
- **Condensed view strip.** Once the tab nav scrolls out of view, a slim fixed
  strip pins to the top showing the current view; tapping it drops down the
  full tab set, so switching views never means scrolling back to the top.
  The sticky filter bar and week jump-bar offset beneath it, and jump/landing scrolls reserve for its height.
  Rolled out family-wide.
- **Changelog started.** Earlier history lives in the git log.
