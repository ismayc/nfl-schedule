import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Same live-mutable player table trick as the stats tests: mutate the array in place so
// individual tests can populate or empty a team's roster.
const H = vi.hoisted(() => ({ players: [] }))
vi.mock('../src/data/leaders.js', () => ({ PLAYERS: H.players }))

import TeamPanel from '../src/components/TeamPanel.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'
import { GAMES_2025 } from './fixtures/season-2025.js'

// A QB with TDs and one without; an RB and a fullback; a receiver with and without
// receptions; and an edge rusher with no scrimmage yardage — one player for each branch
// of playerLine(), spread across four real teams.
const SYNTHETIC = [
  { id: 'p1', name: 'Pat QB', short: 'P.QB', team: 'KC', pos: 'QB', passYds: 4200, passTD: 35, gp: 17 },
  { id: 'p2', name: 'Jordan QB', short: 'J.QB', team: 'GB', pos: 'QB', passYds: 3100, gp: 17 },
  { id: 'p3', name: 'Rush Back', short: 'R.B', team: 'KC', pos: 'RB', rushYds: 1300, rushTD: 14, gp: 17 },
  { id: 'p4', name: 'Full Back', short: 'F.B', team: 'GB', pos: 'FB', rushYds: 400, gp: 17 },
  { id: 'p5', name: 'Wide Out', short: 'W.O', team: 'SF', pos: 'WR', recYds: 1400, rec: 95, gp: 17 },
  { id: 'p6', name: 'Slot Guy', short: 'S.G', team: 'SF', pos: 'WR', recYds: 800, gp: 17 },
  { id: 'p7', name: 'Edge Rush', short: 'E.R', team: 'BUF', pos: 'DE', sacks: 16, gp: 17 },
]

const setPlayers = (arr) => {
  H.players.length = 0
  H.players.push(...arr)
}

const TZ = 'America/New_York'
const open = (abbr, props = {}) =>
  render(
    <FollowProvider>
      <TeamPanel abbr={abbr} games={GAMES_2025} tz={TZ} onClose={() => {}} {...props} />
    </FollowProvider>
  )

beforeEach(() => setPlayers(SYNTHETIC))
afterEach(cleanup)

describe('TeamPanel — closed / invalid', () => {
  it('renders nothing without a team abbreviation', () => {
    const { container } = render(<TeamPanel abbr={null} games={GAMES_2025} tz={TZ} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an abbreviation with no standings row', () => {
    const { container } = render(<TeamPanel abbr="ZZZ" games={GAMES_2025} tz={TZ} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('TeamPanel — populated', () => {
  it('shows the header with a tie in the record, division, and seed (Green Bay)', () => {
    open('GB')
    expect(screen.getByRole('dialog', { name: 'Green Bay Packers' })).toBeInTheDocument()
    // GB finished 9-7-1 — the tie must render, en-dash separated.
    expect(screen.getByText(/9–7–1/)).toBeInTheDocument()
    expect(screen.getByText(/NFC North/)).toBeInTheDocument()
    expect(screen.getByText(/seed \d+/)).toBeInTheDocument()
  })

  it('collapses the record to W-L for a team without ties (Kansas City)', () => {
    const { container } = open('KC')
    // Record leads the sub-line; no ties → W-L only (no trailing "-T").
    expect(container.querySelector('.tp-sub').textContent).toMatch(/^\d+–\d+ ·/)
  })

  it('shows a clinched badge for a team that has clinched (Denver)', () => {
    const { container } = open('DEN')
    expect(within(container).getByText(/clinched/)).toBeInTheDocument()
    expect(container.querySelector('.badge-in')).toBeInTheDocument()
  })

  it('shows an eliminated badge for a team that is out (Kansas City)', () => {
    const { container } = open('KC')
    expect(within(container).getByText(/eliminated/)).toBeInTheDocument()
    expect(container.querySelector('.badge-out')).toBeInTheDocument()
  })

  it('renders the six headline split tiles', () => {
    const { container } = open('GB')
    const labels = [...container.querySelectorAll('.tp-stat-l')].map((n) => n.textContent)
    expect(labels).toEqual(['For', 'Against', 'Diff', 'Home', 'Road', 'Left'])
  })

  it('renders the last-5 form chips with win/loss/tie outcomes', () => {
    const { container } = open('GB')
    const chips = [...container.querySelectorAll('.tp-chip')]
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.length).toBeLessThanOrEqual(5)
    for (const c of chips) expect(['W', 'L', 'T']).toContain(c.textContent)
  })

  it('hides form chips in spoiler-free mode', () => {
    const { container } = open('GB', { hideScores: true })
    expect(container.querySelectorAll('.tp-chip')).toHaveLength(0)
  })

  it('renders a QB stat line (yards + TDs) and an RB rushing line', () => {
    const { container } = open('KC')
    const lines = container.querySelector('.tp-roster').textContent
    expect(lines).toMatch(/4200/)
    expect(lines).toMatch(/rush yds/)
    expect(lines).toMatch(/TD/)
  })

  it('renders a passer without TDs and a fullback without rush TDs', () => {
    const { container } = open('GB')
    const roster = container.querySelector('.tp-roster').textContent
    expect(roster).toMatch(/3100/) // QB passing yards, TD defaults to 0
    expect(roster).toMatch(/rush yds/) // fullback single rushing line
  })

  it('renders a receiver line with and without a reception count', () => {
    const { container } = open('SF')
    const roster = container.querySelector('.tp-roster').textContent
    expect(roster).toMatch(/1400/)
    expect(roster).toMatch(/rec/)
  })

  it('falls back to scrimmage yardage for a defender with no yards', () => {
    const { container } = open('BUF')
    const roster = container.querySelector('.tp-roster').textContent
    // No passing/rushing/receiving yards → the "0 yds" last-resort line.
    expect(roster).toMatch(/0/)
    expect(roster).toMatch(/yds/)
  })

  it('hides the roster when the team has no players', () => {
    setPlayers([])
    const { container } = open('GB')
    expect(container.querySelector('.tp-roster')).not.toBeInTheDocument()
  })

  it('has no Next up section when every game has been played', () => {
    open('GB')
    expect(screen.queryByText('Next up')).not.toBeInTheDocument()
  })
})

describe('TeamPanel — upcoming games', () => {
  const renderEmpty = (abbr, props = {}) =>
    render(
      <FollowProvider>
        <TeamPanel abbr={abbr} games={GAMES} tz={TZ} onClose={() => {}} {...props} />
      </FollowProvider>
    )

  it('lists unplayed games (and no Last 5) on the empty snapshot', () => {
    renderEmpty('KC')
    expect(screen.queryByText('Last 5')).not.toBeInTheDocument()
    const list = screen.getByText('Next up').nextElementSibling
    const rows = list.querySelectorAll('li')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  it('marks a live upcoming game and handles home/away + unknown opponents', () => {
    // A hand-built slate: two completed results (one vs a non-league opponent to exercise
    // the optional-chained team lookup), plus a live home game vs an unknown opponent and
    // an away game vs a real one.
    const games = [
      // A tie so the form-chip title exercises its "Tied" outcome branch.
      { id: 'c1', seasonType: 'regular', week: 1, tip: '2025-09-10T00:00:00.000Z', home: 'KC', away: 'BUF', score: [20, 20] },
      { id: 'c2', seasonType: 'regular', week: 2, tip: '2025-09-17T00:00:00.000Z', home: 'ZZ', away: 'KC', score: [10, 30] },
      { id: 'c3', seasonType: 'regular', week: 3, tip: '2025-09-24T00:00:00.000Z', home: 'KC', away: 'ZZ', live: true },
      { id: 'c4', seasonType: 'regular', week: 4, tip: '2025-10-01T00:00:00.000Z', home: 'BUF', away: 'KC' },
    ]
    render(
      <FollowProvider>
        <TeamPanel abbr="KC" games={games} tz={TZ} onClose={() => {}} />
      </FollowProvider>
    )
    const list = screen.getByText('Next up').nextElementSibling
    expect(within(list).getByText('Live')).toBeInTheDocument()
    // Both a home ("vs") and an away ("at") marker appear.
    const markers = [...list.querySelectorAll('.dim')].map((n) => n.textContent)
    expect(markers).toContain('vs')
    expect(markers).toContain('at')
  })
})

describe('TeamPanel — interactions', () => {
  it('toggles following from the header chip', async () => {
    open('GB')
    const btn = screen.getByRole('button', { name: /Follow/ })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    expect(screen.getByRole('button', { name: /Following/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens a game from a form chip', async () => {
    const onOpenGame = vi.fn()
    const { container } = open('GB', { onOpenGame })
    await userEvent.click(container.querySelector('.tp-chip'))
    expect(onOpenGame).toHaveBeenCalled()
    expect(onOpenGame.mock.calls[0][0]).toBeTruthy()
  })

  it('does not throw clicking a form chip without an onOpenGame handler', async () => {
    const { container } = open('GB')
    await userEvent.click(container.querySelector('.tp-chip'))
    expect(container.querySelector('.tp-chip')).toBeInTheDocument()
  })

  it('routes to the full schedule and closes', async () => {
    const onSchedule = vi.fn()
    const onClose = vi.fn()
    open('GB', { onSchedule, onClose })
    await userEvent.click(screen.getByRole('button', { name: /Full schedule/ }))
    expect(onSchedule).toHaveBeenCalledWith('GB')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes even without an onSchedule handler', async () => {
    const onClose = vi.fn()
    open('GB', { onClose })
    await userEvent.click(screen.getByRole('button', { name: /Full schedule/ }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes from the X button', async () => {
    const onClose = vi.fn()
    open('GB', { onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a backdrop mousedown', () => {
    const onClose = vi.fn()
    const { container } = open('GB', { onClose })
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    open('GB', { onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
