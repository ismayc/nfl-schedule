# Framework notes — from building `the-nfl-schedule`

Running log of adjustments the shared viewer framework should absorb, discovered while
building the NFL viewer as its first real consumer. Grouped so they can be lifted back into
the framework's `core/`, `adapters/`, `scripts/`, and PLAYBOOK.

Status key: 🔴 not yet in framework · 🟡 partially there · 🟢 confirmed the framework already handles it

---

## Adapter / config

- 🔴 **A runtime league-config module is the right shape, and it's missing from `core/`.**
  The adapters (`adapters/nfl.js`) describe the league for the *data/standings* layer, but
  the *app* needs the same identity plus UI-only vocabulary (period short label, kickoff
  noun, ics domain, storage key, theme accent, tagline). I put this in
  `src/config/league.js` and had it re-export ESPN-derived membership from `data/teams.js`.
  The framework should promote a `core/config` shape (adapter + UI vocab) so every app
  imports identity from one place — this is PLAYBOOK §10 debt #2, still open.

- 🟢 **The corrected `winlosstie` standings model is exactly what NFL needs.** `core/utils/
  standings.js` already handles ties (`pct = (w + t/2)/gp`, a `t` field, per-group ranking
  with ties sharing a position). The WNBA app's own `standings.js` did NOT — it would miscount
  a tie as a home loss. Building on the framework's version instead of the sibling's avoided
  that bug outright. Good evidence the extraction was worth it.

## ESPN / scripts

- 🟢 **`scripts/lib/espn.mjs` normalizes `week` already** (`week: ev.week?.number ?? c.week?.number`),
  so NFL's week axis needs no fetch-layer change — it's purely a *view* concern. The
  team-schedule strategy works for NFL unchanged.

- 🔴 **Division membership needs `level=3` on the standings endpoint.** The default NFL
  standings tree nests only conference → 16 teams. Divisions (needed for seeding) require
  `?season=Y&level=3`, which yields root → conference → division → entries. The framework's
  `gen-adapter.mjs` `collectGroups` walks children generically, but nothing tells it to
  request `level=3`. A league that seeds by a *sub*-group (NFL divisions) needs the deeper
  tree — the generator should take a `--level` (or infer it) and record both the division
  and its parent conference.

## Postseason

- 🔴 **`postseason: 'single'` has no bracket util in the framework.** `core/` ships no
  bracket builder at all; the only reference implementation (`the-wnba-schedule/src/utils/
  bracket.js`) is best-of-N series and 8-seed-league-wide — none of it maps to NFL's
  single-elim, 7-seeds-per-conference, #1-bye, re-seeding bracket. I'm writing an NFL
  bracket util from scratch; a `core/utils/bracket-single.js` should be extracted from it.

## Standings / seeding

- 🟢 **W-L-T derivation verified exact.** Derived standings match ESPN's own 2025
  endpoint for all 32 teams (W, L, and T), confirming the ties-aware `pct = (w+t/2)/gp`
  and the countable-games filter. This is the PLAYBOOK §2 derive-and-diff check, and it
  passed first try against real data.

- 🟢 **NFL tiebreakers now follow the official procedures** (closed 2026-08-08; was 🟡).
  The earlier finding stands as the framework lesson: a pairwise comparator cannot
  express the official rules, and the fix was exactly the *grouped* reduction API this
  note asked for. `standings.js` now resolves ties over equal-pct GROUPS: the full
  division and wild-card step chains (common games with the wild-card-only four-game
  minimum, combined points-scored/points-allowed rankings, net points in
  common/conference/all games), the 3+-club reduction with the official restart rule
  (two survivors → step 1 of the two-club chain; three from four+ → step 2), the
  one-club-per-division wild-card elimination with the frozen division order, the
  head-to-head sweep, and per-slot repetition of the whole procedure. Net touchdowns is
  a documented skip (final scores only in the data); the coin toss is deterministic
  alphabetical. Against 2025 all 14 field positions now match ESPN, including the
  SF/LAR wild-card order the pruned chain missed. Every step in every chain is pinned
  by a synthetic fixture that fails if the step is removed (verified by a mutation
  sweep over all three chains, the restart rule, the gate, the sweep, and the
  elimination). Extracting this engine into `core/utils/tiebreak.js` — criteria
  declared per league in the adapter — is still the right framework move.

- 🔴 **Seeding is league-shaped, not generic.** `core/utils/standings.js` `byGroup` ranks
  within a group, but NFL seeding is "four division winners first (1–4), then wild cards
  (5–7)" — a two-tier rule the generic ranker doesn't model. The seeding layer
  (`seedConference`) is NFL-specific and belongs behind an adapter flag like
  `postseason.seedBy: 'division-winners-then-wildcards'`.

## Components / views

- 🔴 **`WeekView` needs two implementations, not one.** The WNBA's WeekView is a
  Sunday-anchored 7-day calendar grid; NFL's is a Week-NUMBER axis (pills 1–18, bye-team
  strip, day sub-groups within a week). These share almost no code. The framework should
  ship both as adapter-selected variants keyed on `timeAxis` ('date' vs 'week').

- 🟡 **The stylesheet is remarkably league-agnostic** — copying `index.css` verbatim and
  changing only the `--accent` tokens (WNBA orange → NFL blue) covered ~95% of the UI. The
  only additions were genuinely new *structures* (week pills, single-elim bracket, division
  groups). Strong signal that `core/index.css` should be extracted with accent tokens as
  the single per-league override.

- 🟡 **New CSS surface area is all in the two structurally-new views** (WeekView,
  single-elim Bracket) plus small division/leader group wrappers. Everything else reused
  the family class names 1:1. When these views land in `core/`, their CSS goes with them.

- 🟢 **Empty-state discipline matters for an off-season launch.** Because 2026 ships with
  zero played games, every view had to render a real empty state (standings all 0-0-0,
  "leaders appear once the season starts", bracket placeholder). This is a good forcing
  function the mid-season WNBA build never exercised — the framework's view contract should
  require an explicit empty state, not assume populated data.

## Testing

- 🟢 **Real completed season as the truth fixture works exactly as PLAYBOOK §7 says.** The
  2025 fixture (272 regular + 13 postseason) caught the seed-order/bracket-display coupling
  bug (a projected WC pairing that didn't match the actual game) that a synthetic fixture
  would never have surfaced. Standings W-L-T and the full bracket-to-champion are asserted
  against it.

- 🔴 **`test/fixtures/build.mjs` reaches into `scripts/fetch-schedule.mjs`** for its
  `normalizeEvent`/`fetchSchedule` — which meant guarding the generator's `main()` behind
  an `import.meta.url === argv` check so importing it doesn't trigger a write. The framework
  generator should export its normalizer/fetch as a library from the start, with a thin CLI
  wrapper, so fixture builders and the refresh job share one code path.

