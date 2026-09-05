# NEWS

A dated changelog for The NFL Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-09-05

- **Freezing the board was only half the job: the clock had to be pinned too.** Yesterday's
  fix froze the *data* three files read, via `test/fixtures/preseason-2026.js`. It did
  nothing about the *wall clock* they also read, and the two fail in different ways. What
  the schedule shows is a comparison against `Date.now()`, so a frozen 2026 board still
  slides into the past as the calendar moves: `app.test.jsx` asserts a card count that
  drops to zero, `whenfilter.cov.test.jsx` asserts that "Upcoming" keeps games and
  "Finished" empties the list, and that contrast inverts outright.
- **Found by rehearsal, not by reading.** A harness shifts `Date` to a chosen instant and
  runs the full coverage gate with the committed schedule untouched. Against this repo it
  found **3 tests failing from September 15** (five days after the real opener, which is
  September 10) and **11 by February 2027**. None of them would have had a commit behind
  them; the calendar alone would have turned the refresh workflow red.
- **All three files now pin the clock for the whole file**, to an instant a few days before
  the opener, which is the state every fixture in them was written against. Re-rehearsed
  green at six dates from September 6, 2026 through January 2028.

## 2026-09-04

- **The suite no longer assumes the season hasn't kicked off.** The FIBA viewer's
  tournament started today and its refresh workflow went red on the first data change:
  48 tests, none of them about basketball. Every one had been asserting against the
  committed schedule, which the refresh rewrites several times a day, so they were
  really asserting "nothing has been played yet". Simulating week 1 here (adding a score
  to the 16 opening games and running the gate) reproduced the same thing: **10 tests
  across 8 files**, six days before the real opener on September 10. A fully played
  regular season broke 6 more, including the live-overlay tests, which mark `GAMES[0]`
  in progress and cannot do that to a game already carrying a final score.
- **`test/fixtures/preseason-2026.js`** is the fix: a frozen, never-regenerated copy of
  the 272-game 2026 schedule as committed before kickoff. It is the bookend to
  `season-2025.js`, which was already doing this job for a *completed* season. The
  "empty season" tests now say so with a fixture instead of borrowing the calendar.
  `app.test.jsx` and `whenfilter.cov.test.jsx` mount App, which reads the schedule
  module directly, so those two `vi.mock` it to the frozen board.
- **`test/schedule-data.test.js`** is new, and closes the hole the above would otherwise
  open. With eight files moved off the live data, nothing in the gate was checking the
  regenerated schedule at all. It asserts what is true of a correct NFL schedule in
  every state the season passes through, so it holds on opening day and in February
  alike: 272 regular-season games, weeks 1 to 18, every team playing 17 with exactly one
  bye, unique ids, kickoffs inside the league year, scores as two finite numbers, no
  tied postseason game, overtime only on a played game, no score on a dead slot, and
  postseason rounds the bracket can place. It is deliberately tolerant of a postseason
  game ESPN has published but not yet captioned, and strict once all 13 exist. Each
  assertion was checked against the real 2025 season and against corrupted copies (a
  dropped game, a duplicated id, a tied Super Bowl, a stray overtime flag, a mislabeled
  round, a team booked twice in one week); all are rejected.
- Verified by running the full coverage gate three ways: against the real committed
  data, against a simulated week 1, and against a simulated full regular season. 673
  tests and 100% coverage in all three.

## 2026-08-30

- **Production is now checked after every deploy.** Nothing in this repo ever fetched an
  absolute production URL: the build, the tests and CI all work on local files, so a host
  that was never created, a URL quietly pointing at a sibling app's site, or a broken
  calendar feed were invisible to the whole gate. A new `smoke` job runs
  `scripts/smoke-prod.mjs` after the deploy and checks the deployed site itself: every
  link-preview tag present and answering 200, the social image actually an image rather
  than the single-page-app catch-all, `coverage.json` readable, and the calendar feed real
  iCalendar with events in it. It reports rather than blocks, because Netlify publishes on
  its own trigger and a red run can just mean "not published yet".
- **Added a `<link rel="canonical">`.** Every other viewer in the family declares one and
  this app did not, leaving crawlers to infer it from `og:url`. It names the same host.
- **The calendar function is inside the coverage gate now.** `coverage.include` was
  `src/**`, so the `webcal://` subscription endpoint, real shipped code that a
  subscriber's calendar hits directly, was measured by nothing while the badge read
  100%. It is now covered, and at 100% like everything else.
- It had **no tests at all** before today. The new ones cover what actually matters
  there: that the endpoint still serves a valid calendar when the live feed is
  unreachable, rather than failing the whole subscription.
- **Test files run one at a time now (`fileParallelism: false`).** Vitest's v8 provider
  merges each worker's coverage after the run, and with files in parallel that merge
  races. It has surfaced in this family three separate ways, all the same fault: a crash
  reading a departed worker's temp file, an unstable percentage between identical runs,
  and a function reported uncovered while its own test demonstrably exercises it. Three
  repos already had this fix; all twelve do now, and the family audit asserts it so the
  claim cannot quietly stop being true. The cost is real on a many-core laptop (35s
  against 132s on the largest suite) and close to nothing on a 2-core CI runner, where
  the parallel run was already CPU-bound. CI is where the flake actually bit.

## 2026-08-29

- **Repo-level guards now run in the test suite.** New `test/guards.test.js`, ported from
  the FIBA viewer, which was the only repo that had one. It pins the invariants that have
  already broken a viewer in this family. The ESPN host must be `site.web.api` everywhere it
  appears: `site.api` serves the same routes but 403s on a browser User-Agent with no CORS
  headers, so it reads as healthy from curl while every deployed page loses live scores. The
  data scripts must import only Node built-ins and in-repo source, because they run in CI
  with no `npm install` of the app dependencies. Every localStorage key must carry this
  app's `nfl:` prefix and never a sibling's, because the hub and all eleven viewers are
  served from one origin and therefore share localStorage. Finally, the generated data files
  must keep their do-not-edit banner, since a hand edit to one is silently reverted by the
  next refresh run. Each guard was checked by reintroducing the bug it describes and
  confirming it fails.
- **Fixed: a concurrent push to main threw away the whole nightly refresh.** The refresh
  job checks main out, spends a couple of minutes rebuilding its committed data from ESPN,
  tests the result, then pushes. The push was a bare `git push`, so if anything else landed
  on main in that window it died with `! [rejected] main -> main (fetch first)` and the
  freshly fetched data was discarded until the next scheduled run. It happened to the WNBA
  viewer today, where a hand push landed one second ahead of the bot. Every refresh workflow
  in the family had the same bare push. The step now rebases its single data commit onto
  whatever arrived and retries, up to three times. A genuine content conflict still fails
  the run rather than force-pushing over someone's work.
- **The test suite now pins its timezone, so `npm test` works without a `TZ=UTC` prefix.**
  Nothing pinned the zone, so the suite ran in whatever zone the machine was in. CI's
  runners sit in UTC and the tests were written against that, so CI was always fine, but a
  local run in a US zone failed on any assertion about a day heading or what counts as
  "today" until you remembered to type `TZ=UTC` in front of it. `vite.config.js` now sets
  `env: { TZ: 'UTC' }`, which is exactly what CI has always done: the full suite passes at
  100% locally in an ambient MST with no prefix. A new guard in `test/guards.test.js`
  asserts both that the pin is in the config and that it took effect in the running
  process, since a dropped pin is invisible on an already-UTC CI runner. Verified by
  deleting the pin and watching both assertions fail. Four repos in the family already had
  a pin, each set to the zone its own content needs; these eight were the ones without.

## 2026-08-27

- **The refresh now ignores teams that are not NFL franchises.** ESPN's team list for a
  season is not a franchise list: it also carries the exhibition clubs a league's teams
  are scheduled to play. The NBA sibling's 2026-27 list picked up "LON", the London
  Lions, a British Basketball League side with a single preseason game on file, which
  would have landed in the data as an extra team in no division, sitting in the team
  picker with zero games. A franchise is a team ESPN places in a conference, which is the
  same signal the ungrouped-teams warning already leaned on, now asked earlier and made
  decisive. Nothing is filtered here today: verified against the live feed, the two
  conferences yield exactly the 32 committed franchises across 8 divisions, and the full
  272-game season fetches unchanged.

## 2026-08-26

- **The refresh now checks the team list before it fetches anything else.** ESPN broke
  the NBA sibling today: its 2026-27 team list dropped from 30 teams to 13, and grew a
  "LON" (the London Lions, a preseason exhibition opponent, not a franchise). That was
  caught only downstream, by the schedule shrink guard, and only by luck: the shrink
  guard is a floor at 90%, because cancelled games legitimately disappear, so losing two
  teams would have cleared it and quietly published a roster missing two franchises. A
  franchise list does not work that way, so it is now compared exactly against what is
  committed, and any difference stops the run and names the teams that came and went.
  The NFL plays in London, Berlin, and Sao Paulo, so a stray venue-shaped "team" landing
  in this feed is not hypothetical here. `--allow-roster-change` is the override for a
  real relocation.
- No app or data changes: verified against the live feed, which still returns all 32
  teams across 8 divisions and the full 272-game season.

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

- **The new-season watch can no longer report success while it fails.** Its check
  step piped the script through `tee`, and the exit status of a pipe is the last
  command's — `tee` always succeeds — so when the script crashed the run still went
  green, the outputs came back empty, and every step behind them skipped quietly.
  Today's outage was hiding there. The step now runs under `pipefail`.

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
