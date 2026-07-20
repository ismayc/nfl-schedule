# Framework notes — from building `the-nfl-schedule`

Running log of adjustments the shared `sports-viewer-meta` framework should absorb,
discovered while building the NFL viewer as its first real consumer. Grouped so they can
be lifted back into the framework's `core/`, `adapters/`, `scripts/`, and PLAYBOOK.

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

- 🟡 **NFL tiebreakers are a genuine framework gap.** A pairwise comparator (what a JS
  sort gives you) cannot express two official NFL rules: the "common games (min 4)" step
  and the 3+-team reduction procedure ("if one team wins a step, the others revert to
  step 1"). My first attempt at common-games actually mis-crowned a division. The pruned
  chain (h2h → division → conference → SOV → SOS → net points) reproduces the correct
  playoff field, all 8 division winners, and 12/14 seed positions against 2025 — the miss
  is an order swap between two identical-record wild cards who both make the field.
  A `core/utils/tiebreak.js` should offer a *grouped* reduction API (resolve an N-way tie
  by repeatedly applying an ordered list of criteria and re-partitioning), not a pairwise
  comparator — and leagues declare their criteria order in the adapter. Until then, seeds
  are a documented approximation; records are exact.

- 🔴 **Seeding is league-shaped, not generic.** `core/utils/standings.js` `byGroup` ranks
  within a group, but NFL seeding is "four division winners first (1–4), then wild cards
  (5–7)" — a two-tier rule the generic ranker doesn't model. The seeding layer
  (`seedConference`) is NFL-specific and belongs behind an adapter flag like
  `postseason.seedBy: 'division-winners-then-wildcards'`.

## (more added as the build proceeds)
