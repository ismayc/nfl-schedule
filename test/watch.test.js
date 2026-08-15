import { describe, it, expect } from 'vitest'
import {
  watchableServices,
  broadcastNotBadged,
  localChannelCatalog,
  isRegional,
  SERVICE_CATALOG,
  SERVICE_BY_KEY,
  LOCAL_CATALOG,
} from '../src/utils/watch.js'

const labels = (b, keys, game) => watchableServices(b, keys, game).map((s) => s.label)

// A game in the regional window (Sunday 1pm ET) and one outside it (Thanksgiving,
// a Thursday) — both CBS-only. Only the first is a Sunday Ticket game.
const sunAfternoon = { broadcast: ['CBS'], tip: '2026-09-13T17:00:00.000Z' } // Sun 1pm ET
const thanksgiving = { broadcast: ['CBS'], tip: '2026-11-26T17:30:00.000Z' } // Thu

describe('watchableServices', () => {
  it('matches a live-TV bundle via the national networks it carries', () => {
    expect(labels(['ESPN'], ['youtubetv'])).toEqual(['YouTube TV'])
    expect(labels(['CBS'], ['youtubetv'])).toEqual(['YouTube TV'])
  })

  it('matches streaming exclusives by name (and simulcast network)', () => {
    expect(labels(['Prime Video'], ['prime'])).toEqual(['Prime Video'])
    expect(labels(['Netflix'], ['netflix'])).toEqual(['Netflix'])
    // Peacock simulcasts NBC's Sunday-night game.
    expect(labels(['NBC'], ['peacock'])).toEqual(['Peacock'])
    // Paramount+ streams the CBS game.
    expect(labels(['CBS'], ['paramount'])).toEqual(['Paramount+'])
  })

  it('only reports services the viewer has selected', () => {
    // The game is on ESPN, but the viewer only has Prime.
    expect(labels(['ESPN'], ['prime'])).toEqual([])
    // Selecting YouTube TV surfaces it.
    expect(labels(['ESPN'], ['prime', 'youtubetv'])).toEqual(['YouTube TV'])
  })

  it('lists every selected service that carries the game, in catalog order', () => {
    // NBC game, viewer has both Peacock and a bundle → catalog order (Peacock first).
    expect(labels(['NBC'], ['youtubetv', 'peacock'])).toEqual(['Peacock', 'YouTube TV'])
  })

  it('lists ALL of a viewer’s many services that carry the game — never capped', () => {
    // An ESPN game with a viewer who has ESPN + every bundle: all are returned.
    expect(labels(['ESPN'], ['youtubetv', 'hulu', 'sling', 'cable', 'espn'])).toEqual([
      'ESPN',
      'YouTube TV',
      'Hulu + Live TV',
      'Sling TV',
      'Cable / Satellite',
    ])
  })

  it('bundle carriage differs — Sling has no CBS game, Fubo/antenna do', () => {
    expect(labels(['CBS'], ['sling'])).toEqual([])
    expect(labels(['CBS'], ['fubo'])).toEqual(['Fubo'])
    expect(labels(['CBS'], ['antenna'])).toEqual(['Antenna (local TV)'])
  })

  it('Sunday Ticket covers ONLY the regional Sunday-afternoon CBS/FOX slate', () => {
    // The regional window matches; the same network on Thanksgiving is one national
    // telecast every market already gets — not a Sunday Ticket game.
    expect(labels(['CBS'], ['sundayticket'], sunAfternoon)).toEqual(['NFL Sunday Ticket'])
    expect(labels(['CBS'], ['sundayticket'], thanksgiving)).toEqual([])
    expect(labels(['ESPN'], ['sundayticket'], { broadcast: ['ESPN'], tip: sunAfternoon.tip })).toEqual([])
    // Without a game to judge the window by, no claim is made.
    expect(labels(['FOX'], ['sundayticket'])).toEqual([])
  })

  it('excludes an unknown/regional feed name nothing matches', () => {
    expect(labels(['FOX Deportes'], ['youtubetv', 'cable', 'antenna'])).toEqual([])
  })

  it('returns [] with no selection or no broadcast', () => {
    expect(watchableServices(['ESPN'], [])).toEqual([])
    expect(watchableServices(['ESPN'], undefined)).toEqual([])
    expect(watchableServices(undefined, ['youtubetv'])).toEqual([])
    expect(watchableServices([], ['youtubetv'])).toEqual([])
  })

  it('exposes a catalog keyed for lookup', () => {
    expect(SERVICE_CATALOG.length).toBeGreaterThanOrEqual(10)
    expect(SERVICE_BY_KEY.youtubetv.label).toBe('YouTube TV')
    expect(SERVICE_BY_KEY.prime.kind).toBe('stream')
    expect(SERVICE_BY_KEY.youtubetv.kind).toBe('bundle')
  })
})

describe('broadcastNotBadged', () => {
  const svc = (label) => ({ label })

  it('drops a network already shown as a badge but keeps the rest', () => {
    expect(broadcastNotBadged(['NBC', 'Peacock'], [svc('Peacock')])).toEqual(['NBC'])
    expect(broadcastNotBadged(['Prime Video'], [svc('Prime Video')])).toEqual([])
  })

  it('leaves a bundle badge’s underlying network in place (YouTube TV ≠ ESPN)', () => {
    expect(broadcastNotBadged(['ESPN'], [svc('YouTube TV')])).toEqual(['ESPN'])
  })

  it('returns the whole list when nothing is badged', () => {
    expect(broadcastNotBadged(['ESPN', 'ABC'], [])).toEqual(['ESPN', 'ABC'])
    expect(broadcastNotBadged(undefined, [])).toEqual([])
    // A missing `watched` is treated as none badged.
    expect(broadcastNotBadged(['ESPN'], undefined)).toEqual(['ESPN'])
  })
})

describe('isRegional', () => {
  // 2026-09-13 is a Sunday; 09-17 a Thursday. Tips are UTC (EDT = UTC-4).
  const game = (broadcast, tip) => ({ broadcast, tip })

  it('flags a Sunday-afternoon CBS or FOX game as regional', () => {
    expect(isRegional(game(['CBS'], '2026-09-13T17:00:00.000Z'))).toBe(true) // 1:00pm ET
    expect(isRegional(game(['FOX'], '2026-09-13T20:25:00.000Z'))).toBe(true) // 4:25pm ET
  })

  it('treats the national windows as NOT regional', () => {
    expect(isRegional(game(['NBC'], '2026-09-14T00:20:00.000Z'))).toBe(false) // SNF (not CBS/FOX)
    expect(isRegional(game(['ESPN', 'ABC'], '2026-09-13T17:00:00.000Z'))).toBe(false) // two nets
    expect(isRegional(game(['CBS'], '2026-09-17T20:15:00.000Z'))).toBe(false) // Thursday
    expect(isRegional(game(['FOX'], '2026-09-13T13:30:00.000Z'))).toBe(false) // 9:30am ET (international)
  })

  it('is false for a game with no broadcast', () => {
    expect(isRegional({ tip: '2026-09-13T17:00:00.000Z' })).toBe(false)
  })
})

describe('localChannelCatalog', () => {
  const g = (home, away, ...broadcast) => ({ home, away, broadcast })

  it('collects the distinct non-national feeds as picker entries, attributed to their team', () => {
    const cat = localChannelCatalog([
      g('AAA', 'BBB', 'CBS', 'Local One'),
      g('CCC', 'AAA', 'Local Two', 'Local One'), // duplicate feed collapses; AAA survives the intersection
      g('DDD', 'EEE', 'CBS'), // national only — contributes nothing
      { id: 'nobroadcast', home: 'FFF', away: 'GGG' }, // games without a broadcast list are tolerated
    ])
    // Local One airs two games whose only common team is AAA. Local Two airs once,
    // leaving BOTH that game's teams as candidates — no single team, so it's
    // unattributed and sorts after the attributed entry.
    expect(cat.map((c) => [c.label, c.team])).toEqual([
      ['Local One', 'AAA'],
      ['Local Two', null],
    ])
    expect(cat[0]).toMatchObject({ key: 'local:Local One', kind: 'local' })
    expect(cat[0].match(['Local One'])).toBe(true)
    expect(cat[0].match(['CBS'])).toBe(false)
  })

  it('sorts unattributed feeds after attributed ones, alphabetically among themselves', () => {
    const cat = localChannelCatalog([
      g('AAA', 'BBB', 'Pinned TV'),
      g('CCC', 'AAA', 'Pinned TV'), // pinned to AAA
      g('DDD', 'EEE', 'Zed TV'), // one game each → unattributed
      g('FFF', 'GGG', 'Alpha TV'),
    ])
    expect(cat.map((c) => c.label)).toEqual(['Pinned TV', 'Alpha TV', 'Zed TV'])
  })

  it('is empty for a fully national slate — which is this league today, so the picker hides it', () => {
    expect(localChannelCatalog([g('AAA', 'BBB', 'CBS')])).toEqual([])
    expect(LOCAL_CATALOG).toEqual([])
  })
})
