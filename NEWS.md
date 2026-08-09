# NEWS

A dated changelog for The NFL Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

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
