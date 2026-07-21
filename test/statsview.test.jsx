import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// A live, mutable player table so a single file can exercise both the populated
// leaderboards and the empty "leaders appear once the season starts" state. The mock
// exports the SAME array reference the tests mutate in place — reassigning it would not
// propagate through the ESM binding, so setPlayers() mutates contents.
const H = vi.hoisted(() => ({ players: [] }))
vi.mock('../src/data/leaders.js', () => ({ PLAYERS: H.players }))

import StatsView from '../src/components/StatsView.jsx'
import { GAMES } from '../src/data/schedule.js'
import { GAMES_2025 } from './fixtures/season-2025.js'

const SYNTHETIC = [
  { id: 'p1', name: 'Pat QB', short: 'P.QB', team: 'KC', pos: 'QB', passYds: 4200, passTD: 35, passYpg: 280, rating: 105, gp: 17 },
  { id: 'p2', name: 'Jordan QB', short: 'J.QB', team: 'GB', pos: 'QB', passYds: 3100, passYpg: 200, rating: 95, gp: 17 },
  { id: 'p3', name: 'Rush Back', short: 'R.B', team: 'KC', pos: 'RB', rushYds: 1300, rushTD: 14, rushYpg: 80, gp: 17 },
  { id: 'p4', name: 'Full Back', short: 'F.B', team: 'GB', pos: 'FB', rushYds: 400, rushYpg: 25, gp: 17 },
  { id: 'p5', name: 'Wide Out', short: 'W.O', team: 'SF', pos: 'WR', recYds: 1400, rec: 95, recTD: 12, gp: 17 },
  { id: 'p6', name: 'Slot Guy', short: 'S.G', team: 'SF', pos: 'WR', recYds: 800, gp: 17 },
  { id: 'p7', name: 'Edge Rush', short: 'E.R', team: 'BUF', pos: 'DE', sacks: 16, gp: 17 },
]

const setPlayers = (arr) => {
  H.players.length = 0
  H.players.push(...arr)
}

const TZ = 'America/New_York'
const renderView = (props = {}) => render(<StatsView tz={TZ} {...props} />)

beforeEach(() => setPlayers(SYNTHETIC))
afterEach(cleanup)

describe('StatsView — populated (2025 season)', () => {
  it('renders the season totals strip with all tiles', () => {
    const { container } = renderView({ games: GAMES_2025, onPickTeam: () => {} })
    expect(screen.getByText('Season so far')).toBeInTheDocument()
    const labels = [...container.querySelectorAll('.tile-label')].map((n) => n.textContent)
    expect(labels).toEqual([
      'Games played',
      'Total points',
      'Points per game',
      'Home win rate',
      'One-score games',
      'Overtime games',
      'Ties',
    ])
  })

  it('expands, then collapses, the one-score / OT / ties drill-downs', async () => {
    const { container } = renderView({ games: GAMES_2025 })

    const oneScore = screen.getByRole('button', { name: /One-score games/ })
    await userEvent.click(oneScore)
    expect(container.querySelector('.drill')).toBeInTheDocument()
    expect(container.querySelector('.drill-note').textContent).toMatch(/^by \d+$/)
    // Clicking the same tile again toggles it closed.
    await userEvent.click(oneScore)
    expect(container.querySelector('.drill')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Overtime games/ }))
    expect(container.querySelector('.drill-note').textContent).toBe('OT')

    await userEvent.click(screen.getByRole('button', { name: /Ties/ }))
    expect(container.querySelector('.drill-note').textContent).toBe('tie')
  })

  it('renders the league-leader boards from the player table', () => {
    const { container } = renderView({ games: GAMES_2025 })
    expect(screen.getByText('Passing leaders')).toBeInTheDocument()
    expect(screen.getByText('Defense leaders')).toBeInTheDocument()
    // Passing-yards board is present with its top value.
    expect(container.querySelector('.leaders')).toBeInTheDocument()
    expect(screen.getByText('4200')).toBeInTheDocument()
    // defInt has no qualifiers → that board renders nothing (null), while sacks does.
    expect(screen.getByText('Sacks')).toBeInTheDocument()
    expect(screen.queryByText('Interceptions')).not.toBeInTheDocument()
  })

  it('renders the scoring-margin chart with positive and negative bars', () => {
    const { container } = renderView({ games: GAMES_2025 })
    expect(screen.getByText('Scoring margin — points per game')).toBeInTheDocument()
    expect(container.querySelector('.margin-bar.pos')).toBeInTheDocument()
    expect(container.querySelector('.margin-bar.neg')).toBeInTheDocument()
  })

  it('renders the playoff race with clinched and eliminated statuses', () => {
    const { container } = renderView({ games: GAMES_2025 })
    const statuses = [...container.querySelectorAll('.status')].map((n) => n.textContent)
    expect(statuses.some((s) => /Clinched/.test(s))).toBe(true)
    expect(statuses.some((s) => /Eliminated/.test(s))).toBe(true)
    expect(container.querySelector('tr.row-elim')).toBeInTheDocument()
  })

  it('routes team clicks from leaders, margin chart, and the race to onPickTeam', async () => {
    const onPickTeam = vi.fn()
    const { container } = renderView({ games: GAMES_2025, onPickTeam })

    await userEvent.click(container.querySelector('.lead-team button'))
    await userEvent.click(container.querySelector('.margin-team'))
    await userEvent.click(container.querySelector('.race .team-btn'))

    expect(onPickTeam).toHaveBeenCalledTimes(3)
    expect(typeof onPickTeam.mock.calls[0][0]).toBe('string')
  })

  it('routes a leaderboard player-name click to onPickPlayer with the full row', async () => {
    const onPickPlayer = vi.fn()
    const { container } = renderView({ games: GAMES_2025, onPickPlayer })

    await userEvent.click(container.querySelector('.lead-name .lead-player'))

    expect(onPickPlayer).toHaveBeenCalledTimes(1)
    // The whole committed row is passed, so the pop-out can render its stat tiles.
    expect(onPickPlayer.mock.calls[0][0]).toMatchObject({ id: expect.any(String), pos: expect.any(String) })
  })

  it('does not throw when a player name is clicked without an onPickPlayer handler', async () => {
    const { container } = renderView({ games: GAMES_2025 })
    await userEvent.click(container.querySelector('.lead-name .lead-player'))
    expect(container.querySelector('.lead-player')).toBeInTheDocument()
  })
})

describe('StatsView — empty and no-handler paths', () => {
  it('renders every empty state on the 2026 snapshot', () => {
    const { container } = renderView({ games: GAMES })
    // Margin chart empty state.
    expect(screen.getByText(/margins appear once games are played/)).toBeInTheDocument()
    // Playoff race still lists teams: in-field (top 7) and in-the-hunt (rest).
    const statuses = [...container.querySelectorAll('.status')].map((n) => n.textContent)
    expect(statuses.some((s) => /In the field/.test(s))).toBe(true)
    expect(statuses.some((s) => /In the hunt/.test(s))).toBe(true)
    // Nothing is clinched or eliminated before kickoff.
    expect(statuses.some((s) => /Clinched|Eliminated/.test(s))).toBe(false)
    expect(container.querySelector('tr.row-elim')).not.toBeInTheDocument()
  })

  it('shows the leaders empty state when the player table is empty', () => {
    setPlayers([])
    renderView({ games: GAMES_2025 })
    expect(screen.getByText('League leaders')).toBeInTheDocument()
    expect(screen.getByText(/Leaders appear once the season starts/)).toBeInTheDocument()
  })

  it('does not throw when clicking teams without an onPickTeam handler', async () => {
    const { container } = renderView({ games: GAMES_2025 })
    await userEvent.click(container.querySelector('.lead-team button'))
    await userEvent.click(container.querySelector('.margin-team'))
    await userEvent.click(container.querySelector('.race .team-btn'))
    expect(container.querySelector('.margin-team')).toBeInTheDocument()
  })
})
