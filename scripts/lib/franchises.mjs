// Which teams make up a season, from two ESPN feeds that answer different questions.
//
// The site feed's `/teams` list is the CURRENT league, with colors and logos. The core
// API's conference membership for a season is that season's franchise list. They can
// disagree in both directions:
//
// - The site list carries exhibition clubs no conference holds (the NBA sibling's "LON",
//   the London Lions, on 2026-08-26). Those are dropped.
// - A franchise can leave the site list while its season stands. On 2026-11-01 ESPN
//   marked the Connecticut Sun (id 18) inactive and took it off `/teams`, as the 2027
//   season lists the Houston Comets (id 4) in its place. The 2026 conferences still hold
//   all 15 teams, CON included, so filtering the site list down to them returned 14 and
//   the roster guard refused every refresh for nine days. Such a franchise is returned
//   in `missing`, for the caller to fetch from `/teams/{id}`, which still serves it.
//
// An empty franchise set means the group feed is unusable. Filtering on it would drop
// every team and report the wrong problem, so the site list passes through untouched
// and the roster guard stays the backstop.
export function splitFranchises(listed, franchises) {
  if (!franchises.size) return { teams: listed, dropped: [], missing: [] }
  const teams = listed.filter((t) => franchises.has(t.id))
  const dropped = listed.filter((t) => !franchises.has(t.id))
  const onList = new Set(listed.map((t) => t.id))
  const missing = [...franchises].filter((id) => id && !onList.has(id)).sort((a, b) => a - b)
  return { teams, dropped, missing }
}
