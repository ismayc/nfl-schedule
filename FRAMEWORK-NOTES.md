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

## (more added as the build proceeds)
