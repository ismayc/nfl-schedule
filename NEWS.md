# NEWS

A dated changelog for The NFL Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-09

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
