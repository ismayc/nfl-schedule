# NEWS

A dated changelog for The NFL Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-16

- **The data scripts now fetch from `site.web.api.espn.com`.** ESPN's edge started
  refusing `site.api.espn.com` for requests coming from datacenter IPs, which is
  every unattended refresh — the sibling WNBA viewer's had been failing with
  `HTTP 403` all day before the cause was found. The same URLs answer normally from
  a home connection, so the block is on the host, not on us. Its sibling
  `site.web.api` carries the identical routes with identical payloads and no block,
  verified route by route.
- Nothing about the app changed — same data, same tests. The live score overlay was
  never affected, because it runs in your browser rather than in a datacenter.

## 2026-08-15

- **My services is ready for local & regional channels.** Ported from
  wnba-schedule: any market feed (an RSN or local station) named in the schedule
  data becomes its own pickable entry in a collapsible "Local & regional
  channels" shelf, grouped by the team it follows, so carriage that depends on
  where you live is your choice rather than a wrong national guess. This
  league's ESPN slate is entirely national today, so the shelf stays hidden until
  such a feed appears — at which point it shows up on its own, with no code
  change.

## 2026-08-14

- **A New season watch now guards the rollover.** Ported from nba-schedule
  after its 2026-27 release: a daily workflow asks ESPN whether the NEXT
  season (committed season + 1) has been published; the day it lands it files
  a one-time issue and drafts the mechanical half of the rollover as a draft
  PR. The detector was re-derived for this league and verified against the
  live scoreboard (the current season detects as complete; the next reports
  not-yet). The season-<label> branch it creates must never be deleted — its
  existence is the once-per-season guard.

- **The default schedule now folds the far future behind "Later games".** With
  the 2026 season not kicking off until September, nothing is in the past, so
  the default view was rendering all 272 games on load — the same fresh-rollover
  weight that timed out the NBA viewer's CI app tests. It now shows the next
  fortnight of game-days (roughly four to five season weeks, since NFL games
  cluster on ~3 days a week), with the rest behind a "Later games" toggle that
  mirrors "Earlier games" (count badge included). The toggle is component-local,
  never in the URL or localStorage (ported from nba-schedule).

- **A PR branch can no longer cancel main's CI or deploy.** The whole CI
  workflow (pull-request runs included) and the refresh workflow shared one
  static `pages` concurrency group; GitHub keeps one running + one pending run
  per group and each new arrival cancels the previous pending one, so a busy PR
  branch could kill main's queued runs — this bit the NBA viewer during its
  2026-08-13 rollover PR. CI now groups per ref, the refresh has its own group,
  and only the Pages deploy keeps a shared job-level `pages` lock (ported from
  nba-schedule).

- **The refresh now defaults to the committed season, not the calendar.** The
  fetch script derived its default season from today's date; the NBA viewer
  showed (2026-08-13) that the morning after a rollover this re-fetches the
  ARCHIVED season over the freshly committed one — growth, so the shrink guard
  waves it through, and only the coverage gate stops the site reverting a whole
  season. The default is now `SEASON` from `src/data/teams.js`: the bot
  refreshes whatever season the site is committed to, and only a rollover moves
  that target.

## 2026-08-11

- **Archived leader boards now show team badges.** They were hidden behind a
  `showTeam={false}` inherited from the basketball siblings, whose feeds answer a
  season-scoped query with the player's *current* club. ESPN's NFL feed does not
  do that — `season=2021` puts Davante Adams in Green Bay, `season=2022` puts
  Josh Jacobs in Las Vegas and Derrick Henry in Tennessee, all three of whom have
  since moved — so the badges were correct all along and simply weren't rendered.
  The stale explanatory copy under the board is gone with them.

  Checked at the same time, and NOT changed, because the NFL board doesn't have
  the problems its siblings did: every category here is a season **total**
  (yards, TDs, receptions, sacks, INTs), so there is no per-game average needing
  a games qualifier and no decimal to break ties on.

## 2026-08-10

- **The refresh gate is now CI's own gate.** The twice-daily refresh ran plain
  `npm test` before committing, but a bot push triggers no CI — so refreshed
  data could break the 100% coverage invariant invisibly until the next human
  push (exactly what happened with the WNBA race engine this morning). The
  refresh workflow now runs the same coverage command CI runs.
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
