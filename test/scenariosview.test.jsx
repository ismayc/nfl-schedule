import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
import ScenariosView, { Path } from '../src/components/ScenariosView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { conferenceSeeds } from '../src/utils/standings.js'
import { OUT, rankScenario, remainingGames } from '../src/utils/scenarios.js'
import { TEAM_BY_ABBR } from '../src/data/teams.js'
import { GAMES as FROZEN } from './fixtures/frozen/schedule.js'
import { GAMES_2025 } from './fixtures/season-2025.js'

// The view reads no clock itself, but it renders the frozen board, so the clock is
// pinned to that board's own day (September 19, 2026) like every test in this family
// that reads a frozen board.
// The engine stops at a 200 ms wall-clock budget (BUDGET_MS) rather than freeze the
// page. Read on the real clock, that makes every test that expects a grid depend on how
// busy the machine is: on September 29, 2026 CI's clock rehearsal (a slower coverage run)
// and a loaded laptop both tripped it, and the grid tests found the "stopped rather than
// freeze" note instead. So the clock the budget reads is frozen by default here; the
// tests of the budget itself pass their own advancing clock.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-19T16:00:00Z'))
  vi.spyOn(performance, 'now').mockReturnValue(0)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const REG = GAMES_2025.filter((g) => g.seasonType === 'regular')
// The 2025 season with its last `n` games still to play.
const lastOpen = (n) => REG.map((g, i) => (i >= REG.length - n ? { ...g, score: undefined } : g))
const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

const renderView = (games, props = {}) =>
  render(
    <FollowProvider>
      <ScenariosView games={games} tz="America/New_York" {...props} />
    </FollowProvider>
  )

const gridRows = (container) =>
  [...container.querySelectorAll('.sc-matrix tbody tr:not(.cutline):not(.sc-detail-row)')]

describe('ScenariosView: too many open games', () => {
  it('says how many are open and how many more to pick, and plays nothing out', () => {
    const { container } = renderView(FROZEN)
    expect(screen.getByRole('heading', { name: 'Scenarios' })).toBeInTheDocument()
    expect(screen.getByText(/255 games are still open/)).toBeInTheDocument()
    expect(screen.getByText(/Pick 249 more/)).toBeInTheDocument()
    expect(screen.getByText(/strength of victory and strength of schedule/)).toBeInTheDocument()
    expect(container.querySelector('.sc-matrix')).toBeNull()
    expect(screen.getByText('Games left · 0 of 255 picked')).toBeInTheDocument()
    // One block per week; only the first open week starts expanded.
    const weeks = container.querySelectorAll('details.sc-week')
    expect(weeks).toHaveLength(17)
    expect(weeks[0].open).toBe(true)
    expect(weeks[1].open).toBe(false)
    expect(screen.getByRole('button', { name: 'Clear picks' })).toBeDisabled()
  })

  it('Favorites win picks every game and shows the seeding; Clear picks goes back', () => {
    const { container } = renderView(FROZEN)
    fireEvent.click(screen.getByRole('button', { name: 'Favorites win' }))
    expect(screen.getByText('Games left · 255 of 255 picked')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Seeding with your picks' })).toBeInTheDocument()
    expect(container.querySelectorAll('.sc-final li')).toHaveLength(16)
    expect(screen.getByText(/has the bye/)).toBeInTheDocument()
    expect(container.querySelectorAll('.sc-matchups li')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Clear picks' }))
    expect(screen.getByText(/255 games are still open/)).toBeInTheDocument()
  })

  it('picks a winner or a tie, and a second tap leaves the game open', () => {
    renderView(FROZEN)
    const [game] = remainingGames(FROZEN)
    const tie = screen.getAllByRole('button', { name: `${game.away} and ${game.home} tie` })[0]
    fireEvent.click(tie)
    expect(tie).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Games left · 1 of 255 picked')).toBeInTheDocument()
    expect(screen.getByText(/Pick 248 more/)).toBeInTheDocument()
    fireEvent.click(tie)
    expect(tie).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/Pick 249 more/)).toBeInTheDocument()
  })
})

describe('ScenariosView: the grid', () => {
  it('plays out 3^3 outcomes and lays the grid out by conference', () => {
    const { container } = renderView(lastOpen(3))
    expect(screen.getByRole('heading', { name: /AFC · where every team can finish · 27 outcomes/ })).toBeInTheDocument()
    const rows = gridRows(container)
    expect(rows).toHaveLength(16)
    // Seeds 1-7 and Out, plus the team column.
    expect(container.querySelectorAll('.sc-matrix thead th')).toHaveLength(OUT + 1)
    expect(container.querySelector('.sc-matrix .cutline').textContent).toMatch(/top 7 make the postseason/)
    // Every row's shares add to 100% (no points-dependent outcomes on this board).
    for (const row of rows) {
      const pct = [...row.querySelectorAll('.sc-cell')]
        .map((b) => b.textContent)
        .filter((t) => /%$/.test(t))
        .map((t) => (t === '<1%' ? 0 : parseInt(t, 10)))
      const locks = row.querySelectorAll('.sc-cell.locked').length
      if (!locks) expect(pct.reduce((a, b) => a + b, 0)).toBe(100)
    }
    // Legend: only the marks on screen, and no points note.
    expect(container.querySelector('.legend').textContent).toMatch(/Each row adds up to 100%/)
    expect(container.querySelector('.legend').textContent).not.toMatch(/\*:/)
  })

  it('switches to the NFC and closes an open breakdown', () => {
    const { container } = renderView(lastOpen(3))
    const afc = gridRows(container).map((r) => r.querySelector('.team-nick').textContent)
    fireEvent.click(gridRows(container)[0].querySelector('.sc-cell:not([disabled])'))
    expect(container.querySelector('.sc-detail-row')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'NFC' }))
    expect(screen.getByRole('button', { name: 'NFC' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.sc-detail-row')).toBeNull()
    const nfc = gridRows(container).map((r) => r.querySelector('.team-nick').textContent)
    expect(nfc).toHaveLength(16)
    expect(nfc.some((a) => afc.includes(a))).toBe(false)
  })

  it('marks division titles, berths, and eliminations from the same counts the cells show', () => {
    const { container } = renderView(lastOpen(3))
    const legend = container.querySelector('.legend').textContent
    const rows = gridRows(container)
    const label = (r) => r.querySelector('.team-btn').getAttribute('aria-label')
    const div = rows.filter((r) => /clinched the division/.test(label(r)))
    const out = rows.filter((r) => /eliminated/.test(label(r)))
    expect(div.length).toBeGreaterThan(0)
    expect(out.length).toBeGreaterThan(0)
    for (const r of div) {
      const cells = [...r.querySelectorAll('.sc-cell')]
      // Nothing possible past seed 4.
      expect(cells.slice(4).every((c) => c.disabled)).toBe(true)
      expect(r.querySelector('.badge-in').textContent).toBe('✓ div')
    }
    for (const r of out) {
      expect(r).toHaveClass('row-elim')
      expect(r.querySelector('.sc-cell.out.locked').textContent).toBe('✕')
    }
    expect(legend).toMatch(/✓ div: wins the division/)
    expect(legend).toMatch(/✕: out of the playoffs/)
  })

  it('opens what a cell takes under its own row, and a line picks those results', () => {
    const games = lastOpen(3)
    const { container } = renderView(games)
    // A cell that is possible but not locked.
    const cell = [...container.querySelectorAll('.sc-cell:not([disabled]):not(.locked)')][0]
    const row = cell.closest('tr')
    fireEvent.click(cell)
    expect(cell).toHaveAttribute('aria-pressed', 'true')
    const detail = container.querySelector('.sc-detail-row')
    expect(detail.previousElementSibling).toBe(row)
    expect(detail.textContent).toMatch(/in \d+ of 27 outcomes/)
    const line = within(detail).getAllByRole('button', { name: /^Pick / })[0]
    fireEvent.click(line)
    // The breakdown closes and at least one of the three games is now picked.
    expect(container.querySelector('.sc-detail-row')).toBeNull()
    expect(screen.getByText(/Games left · [123] of 3 picked/)).toBeInTheDocument()
    // Tapping the same cell again closes it.
    const again = [...container.querySelectorAll('.sc-cell:not([disabled])')][0]
    fireEvent.click(again)
    expect(container.querySelector('.sc-detail-row')).not.toBeNull()
    fireEvent.click(again)
    expect(container.querySelector('.sc-detail-row')).toBeNull()
  })

  it('reads a locked cell as locked', () => {
    const { container } = renderView(lastOpen(3))
    const locked = container.querySelector('.sc-cell.locked:not(.out)')
    fireEvent.click(locked)
    expect(container.querySelector('.sc-detail-row').textContent).toMatch(/Locked\. The .* in every remaining outcome/)
    expect(within(container.querySelector('.sc-detail-row')).queryByRole('button', { name: /^Pick / })).toBeNull()
  })

  it('reads a share that rounds to 0% as <1%, not as nothing', () => {
    // The AFC South's last six games open (from week 16): 729 outcomes, and IND finish
    // sixth in exactly 3 of them.
    const div = (g) => [g.home, g.away].some((t) => ['HOU', 'IND', 'JAX', 'TEN'].includes(t))
    const ids = new Set(REG.filter((g) => g.week >= 16 && div(g)).slice(-6).map((g) => g.id))
    const games = REG.map((g) => (ids.has(g.id) ? { ...g, score: undefined } : g))
    const { container } = renderView(games)
    expect(screen.getByRole('heading', { name: /729 outcomes/ })).toBeInTheDocument()
    const ind = gridRows(container).find((r) => r.querySelector('.team-nick').textContent === 'IND')
    const sixth = ind.querySelectorAll('.sc-cell')[5]
    expect(sixth.textContent).toBe('<1%')
    expect(sixth.getAttribute('aria-label')).toBe('IND the 6 seed: 3 of 729 outcomes')
  })

  it('highlights a followed team', () => {
    localStorage.setItem('nfl:followed', JSON.stringify(['KC']))
    const { container } = renderView(lastOpen(3))
    const kc = gridRows(container).find((r) => r.querySelector('.team-nick').textContent === 'KC')
    expect(kc).toHaveClass('row-followed')
    expect(gridRows(container).filter((r) => r.classList.contains('row-followed'))).toHaveLength(1)
    localStorage.clear()
  })

  it('opens the team panel from a grid row', () => {
    const onPick = vi.fn()
    const { container } = renderView(lastOpen(3), { onPick })
    fireEvent.click(gridRows(container)[0].querySelector('.team-btn'))
    expect(onPick).toHaveBeenCalledWith(gridRows(container)[0].querySelector('.team-nick').textContent)
  })

  it('marks a game in progress as Live and still plays it out three ways', () => {
    const games = lastOpen(2).map((g, i, all) => (i === all.length - 1 ? { ...g, score: [28, 0], live: true } : g))
    renderView(games)
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /9 outcomes/ })).toBeInTheDocument()
  })

  it('drops a pick once its game goes final', () => {
    const games = lastOpen(3)
    const { rerender } = renderView(games)
    const g = remainingGames(games)[0]
    fireEvent.click(screen.getByRole('button', { name: `${g.away} and ${g.home} tie` }))
    expect(screen.getByText('Games left · 1 of 3 picked')).toBeInTheDocument()
    const later = games.map((x) => (x.id === g.id ? { ...x, score: [20, 10] } : x))
    rerender(
      <FollowProvider>
        <ScenariosView games={later} tz="America/New_York" />
      </FollowProvider>
    )
    expect(screen.getByText('Games left · 0 of 2 picked')).toBeInTheDocument()
  })

  it('stops rather than freeze when playing it out runs past the time budget', () => {
    let t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 150))
    const { container } = renderView(lastOpen(3))
    expect(screen.getByText(/took longer than 200 ms/)).toBeInTheDocument()
    expect(container.querySelector('.sc-matrix')).toBeNull()
  })
})

describe('ScenariosView: when points decide', () => {
  // Real, tie-heavy results with the last two games open: some ties run past strength of
  // schedule, where a picked game's missing score leaves the order open.
  const tieHeavy = () => {
    const rnd = rng(10)
    return REG.map((g, i) => {
      if (i >= REG.length - 2) return { ...g, score: undefined }
      const r = rnd()
      return { ...g, score: r < 0.7 ? [17, 17] : r < 0.85 ? [20, 17] : [17, 20] }
    })
  }

  it('marks points-dependent outcomes with * and says so in the legend and the breakdown', () => {
    const { container } = renderView(tieHeavy())
    for (const conf of ['AFC', 'NFC']) {
      fireEvent.click(screen.getByRole('button', { name: conf }))
      if (container.querySelector('.sc-cell sup')) break
    }
    const star = container.querySelector('.sc-cell sup').closest('button')
    expect(star.getAttribute('aria-label')).toMatch(/more depending on points/)
    expect(container.querySelector('.legend').textContent).toMatch(/apart from outcomes marked \*/)
    expect(container.querySelector('.legend').textContent).toMatch(/\*: also possible/)
    fireEvent.click(star)
    expect(container.querySelector('.sc-detail-row').textContent).toMatch(/points/)
  })

  it('shows a seed that only the points could give', () => {
    const { container } = renderView(tieHeavy())
    let found = null
    for (const conf of ['AFC', 'NFC']) {
      fireEvent.click(screen.getByRole('button', { name: conf }))
      found = [...container.querySelectorAll('.sc-cell')].find((b) => b.textContent === '*')
      if (found) break
    }
    fireEvent.click(found)
    expect(container.querySelector('.sc-detail-row').textContent).toMatch(
      /only if the points tiebreakers fall their way/
    )
    expect(container.querySelector('.sc-detail-row').textContent).toMatch(/That depends on points/)
  })

  it('shows a picked season whose order hangs on points as a range', () => {
    const games = tieHeavy()
    const open = remainingGames(games)
    // Find, with the engine, a way to pick the two games that leaves some order to points.
    const sides = ['home', 'away', 'tie']
    const combos = sides.flatMap((a) => sides.map((b) => [a, b]))
    const [a, b] = combos.find(([x, y]) => {
      const ranked = rankScenario(games, { [open[0].id]: x, [open[1].id]: y })
      return ranked.AFC.scoreDependent || ranked.NFC.scoreDependent
    })
    const ranked = rankScenario(games, { [open[0].id]: a, [open[1].id]: b })
    const conf = ranked.AFC.scoreDependent ? 'AFC' : 'NFC'
    const { container } = renderView(games)
    const pick = (g, side) =>
      fireEvent.click(
        screen.getByRole('button', {
          name:
            side === 'tie'
              ? `${g.away} and ${g.home} tie`
              : `${TEAM_BY_ABBR[side === 'home' ? g.home : g.away].displayName} win`,
        })
      )
    pick(open[0], a)
    pick(open[1], b)
    fireEvent.click(screen.getByRole('button', { name: conf }))
    const ranges = [...container.querySelectorAll('.sc-final .rank')].filter((x) => /–/.test(x.textContent))
    expect(ranges.length).toBeGreaterThan(0)
    expect(ranges[0]).toHaveAttribute('title', 'Depends on points')
    expect(container.textContent).toMatch(/A place shown as a range could land anywhere in it/)
    expect(container.textContent).toMatch(/points: no pick can settle this/)
  })

  it('says every place is open when too many ties reach the points', () => {
    // Every game a real 17-17 tie except one, which the reader then picks as a tie too:
    // 32 identical records, so the engine stops exploring and claims nothing.
    const games = REG.map((g, i) => (i === REG.length - 1 ? { ...g, score: undefined } : { ...g, score: [17, 17] }))
    const { container } = renderView(games)
    const [g] = remainingGames(games)
    fireEvent.click(screen.getByRole('button', { name: `${g.away} and ${g.home} tie` }))
    expect(container.textContent).toMatch(/not every order was played out; every place is shown as open/)
    expect(container.querySelector('.sc-final .rank').textContent).toBe('1–16')
  })
})

describe('ScenariosView: a finished season', () => {
  it('shows the final seeding from the real results, both conferences', () => {
    const { container } = renderView(REG)
    expect(screen.getByText(/The regular season is complete/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Final seeding' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Favorites win' })).toBeNull()
    const real = conferenceSeeds(REG)
    const names = () => [...container.querySelectorAll('.sc-final .team-nick')].map((n) => n.textContent)
    expect(names()).toEqual(real.AFC.map((r) => r.team.name))
    fireEvent.click(screen.getByRole('button', { name: 'NFC' }))
    expect(names()).toEqual(real.NFC.map((r) => r.team.name))
    // The division winners carry their mark; a real season has no points caveat.
    expect(container.querySelectorAll('.sc-final .badge-in')).toHaveLength(4)
    expect(container.textContent).not.toMatch(/no pick can settle/)
    const onPick = vi.fn()
    cleanup()
    const r = renderView(REG, { onPick })
    fireEvent.click(r.container.querySelector('.sc-final .team-btn'))
    expect(onPick).toHaveBeenCalledWith(real.AFC[0].abbr)
  })
})

describe('Path: a cell with more combinations than fit', () => {
  it('lists six and sums up the rest', () => {
    const undecided = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, home: 'KC', away: 'DEN' }))
    const rnd = rng(3)
    const scenarios = Array.from({ length: 729 }, (_, i) => i).filter(() => rnd() < 0.5)
    const cell = { count: scenarios.length, maybe: 0, tiebreaks: { 'head-to-head': 3 }, scenarios }
    const result = { total: 729, undecided, teams: { KC: { 1: cell } } }
    const onApply = vi.fn()
    const { container } = render(
      <Path result={result} selected={{ abbr: 'KC', seed: 1 }} picks={{}} onApply={onApply} />
    )
    expect(container.querySelectorAll('.sc-combo')).toHaveLength(6)
    expect(container.textContent).toMatch(/\+ \d+ more combinations \([\d,]+ outcomes\)/)
    expect(container.textContent).toMatch(/head-to-head: in 3 of/)
    fireEvent.click(container.querySelector('.sc-combo'))
    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
