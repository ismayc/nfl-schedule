import { describe, it, expect } from 'vitest'
import * as liveSchedule from '../../src/data/schedule.js'
import * as liveLeaders from '../../src/data/leaders.js'
import * as liveTeams from '../../src/data/teams.js'
import * as frozenSchedule from '../fixtures/frozen/schedule.js'
import * as frozenLeaders from '../fixtures/frozen/leaders.js'
import * as frozenTeams from '../fixtures/frozen/teams.js'

// LIVE suite (npm run test:data). The main suite never sees the real data modules: the
// frozenData plugin in vite.config.js swaps each for a stand-in. That is only safe while
// a stand-in has the same SHAPE as the module it replaces. If scripts/fetch-schedule.mjs
// starts writing a new export or a new field and the stand-in lacks it, the main suite
// would go on passing against a shape the site no longer has. This is the check.

const PAIRS = [
  ['schedule.js', liveSchedule, frozenSchedule],
  ['leaders.js', liveLeaders, frozenLeaders],
  ['teams.js', liveTeams, frozenTeams],
]

// Every key seen on any row, so an optional field present on one row still counts.
const fieldsOf = (rows) => [...new Set(rows.flatMap((r) => Object.keys(r)))].sort()

describe('frozen stand-ins keep the shape of the live modules', () => {
  it.each(PAIRS)('%s exports the same names', (_name, live, frozen) => {
    expect(Object.keys(frozen).sort()).toEqual(Object.keys(live).sort())
  })

  it('schedule.js constants are identical', () => {
    const { GAMES: _live, ...liveConsts } = liveSchedule
    const { GAMES: _frozen, ...frozenConsts } = frozenSchedule
    expect(frozenConsts).toEqual(liveConsts)
  })

  // Deliberately NOT checked: row fields in general. Rows gain fields for reasons that are
  // not mistakes (the first postseason game carries a round the regular season never had),
  // and a check on them would block a correct refresh. Export names and constants only
  // change when the fetch script changes, which arrives by a human push.
  it('keeps the team fields the code reads by name', () => {
    for (const k of ['abbr']) expect(fieldsOf(liveTeams.TEAMS), k).toContain(k)
  })

  // Only once the table has rows: it is empty from the rollover until week 1, and an empty
  // table has no fields to check. The NBA sibling needed this guard in its preseason.
  it.runIf(liveLeaders.PLAYERS.length > 0)('keeps the player fields the code reads by name', () => {
    for (const k of ['id', 'name', 'team', 'pos', 'gp']) {
      expect(fieldsOf(liveLeaders.PLAYERS), k).toContain(k)
    }
  })
})
