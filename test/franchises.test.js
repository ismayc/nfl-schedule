// A franchise that leaves ESPN's current team list while its season stands. On
// 2026-11-01 ESPN marked the WNBA's Connecticut Sun (id 18) inactive and dropped it from
// `/teams`, as the 2027 season lists the Houston Comets (id 4) instead. The WNBA sibling's
// refresh then refused every run for nine days ("the team list changed from 15 teams to
// 14. gone: CON"). The same filter lives here; the fixtures below are that WNBA case.

import { describe, it, expect } from 'vitest'
import { splitFranchises } from '../scripts/lib/franchises.mjs'

const team = (id, abbreviation) => ({ id, abbreviation })

describe('splitFranchises', () => {
  // The 2026 conferences, as ESPN served them on 2026-11-10: CON (18) is still in one.
  const season2026 = new Set(['3', '5', '6', '8', '9', '11', '14', '16', '17', '18', '19', '20', '129689', '131935', '132052'])
  // The current /teams list that day: 14 teams, no CON.
  const current = [...season2026].filter((id) => id !== '18').map((id) => team(id, `T${id}`))

  it('reports a season franchise missing from the current list, to fetch by id', () => {
    const { teams, dropped, missing } = splitFranchises(current, season2026)
    expect(teams).toHaveLength(14)
    expect(dropped).toEqual([])
    expect(missing).toEqual(['18'])
  })

  it('drops an exhibition club no conference holds (the NBA sibling\'s LON)', () => {
    const listed = [...current, team('18', 'CON'), team('134478', 'LON')]
    const { teams, dropped, missing } = splitFranchises(listed, season2026)
    expect(teams.map((t) => t.id).sort()).toEqual([...season2026].sort())
    expect(dropped.map((t) => t.abbreviation)).toEqual(['LON'])
    expect(missing).toEqual([])
  })

  it('passes the list through when conference membership is unavailable', () => {
    expect(splitFranchises(current, new Set())).toEqual({ teams: current, dropped: [], missing: [] })
  })

  it('ignores an id the group feed failed to parse', () => {
    expect(splitFranchises(current, new Set([...season2026, undefined])).missing).toEqual(['18'])
  })

  it('lists missing ids in numeric order', () => {
    expect(splitFranchises([], new Set(['20', '4', '132052'])).missing).toEqual(['4', '20', '132052'])
  })
})
