import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES_2025 } from './fixtures/season-2025.js'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

const REG = GAMES_2025.filter((g) => g.seasonType === 'regular')

afterEach(cleanup)
beforeEach(() => localStorage.clear())

describe('Bracket — before the season starts', () => {
  it('shows the placeholder card on the empty 2026 snapshot', () => {
    render(<Bracket games={GAMES} tz={TZ} />)
    expect(screen.getByText(/bracket isn't set yet/i)).toBeInTheDocument()
    expect(screen.queryByText('AFC')).not.toBeInTheDocument()
  })
})

describe('Bracket — a completed postseason (2025)', () => {
  it('crowns the champion and shows both conference trees', () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} />)
    expect(screen.getByText(/win the Super Bowl/i)).toBeInTheDocument()
    expect(screen.getByText('Seattle Seahawks')).toBeInTheDocument()
    expect(container.querySelector('.bx-sb-champ')).toHaveTextContent('Seahawks')
    expect(screen.getByRole('heading', { name: 'AFC' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'NFC' })).toBeInTheDocument()
    // Two #1-seed byes, one per conference.
    expect(screen.getAllByText('Bye')).toHaveLength(2)
    expect(screen.queryByText(/Projected/)).not.toBeInTheDocument()
  })

  it('shows played matchups as decided with scores', () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} />)
    expect(container.querySelectorAll('.bx-match-done').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.bx-won').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.bx-lost').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.bx-score').length).toBeGreaterThan(0)
  })

  it('routes a matchup and a bye team click to onPick', async () => {
    const onPick = vi.fn()
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} onPick={onPick} />)
    await userEvent.click(container.querySelector('.bx-match .bx-team'))
    await userEvent.click(container.querySelector('.bx-bye .bx-team'))
    expect(onPick).toHaveBeenCalledTimes(2)
  })

  it('flags a followed team inside a slot', () => {
    localStorage.setItem('nfl:followed', JSON.stringify(['SEA']))
    const { container } = render(
      <FollowProvider>
        <Bracket games={GAMES_2025} tz={TZ} />
      </FollowProvider>
    )
    expect(container.querySelector('.bx-side.followed')).toBeTruthy()
  })
})

describe('Bracket — projected from the regular season only', () => {
  it('shows the projected banner and TBD slots', () => {
    const { container } = render(<Bracket games={REG} tz={TZ} />)
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    expect(screen.queryByText(/win the Super Bowl/i)).not.toBeInTheDocument()
    // Projected matchups carry no score.
    expect(container.querySelectorAll('.bx-match-proj').length).toBeGreaterThan(0)
    // Divisional/Conf/SB slots are undecided → TBD feeders.
    expect(screen.getAllByText('TBD').length).toBeGreaterThan(0)
    // The #1 seed still earns a bye.
    expect(screen.getAllByText('Bye')).toHaveLength(2)
  })
})

describe('Bracket — a partial postseason (through the conference titles)', () => {
  // Dropping the Super Bowl leaves both conference champions decided but the SB itself
  // projected — its slots then carry real teams with no seed number.
  const NO_SB = GAMES_2025.filter((g) => g.round !== 'SB')

  it('projects the Super Bowl from the two conference champions, uncrowned', () => {
    const { container } = render(<Bracket games={NO_SB} tz={TZ} />)
    expect(screen.queryByText(/win the Super Bowl/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Projected\./)).not.toBeInTheDocument()
    // Champions of each conference face off in the projected SB slot, and because that
    // slot is projected it carries no seed number.
    const sb = container.querySelector('.bx-sb')
    expect(within(sb).getByText('Patriots')).toBeInTheDocument()
    expect(within(sb).getByText('Seahawks')).toBeInTheDocument()
    expect(sb.querySelector('.bx-seed')).toBeNull()
  })
})

describe('Bracket — live and scheduled matchups', () => {
  const liveWC = {
    id: 'lw',
    tip: '2026-01-10T21:30:00.000Z',
    seasonType: 'postseason',
    round: 'WC',
    home: 'DAL',
    away: 'PHI',
    live: true,
    statusLabel: 'Q3 7:12',
    score: [14, 10],
  }
  const scheduledWC = {
    id: 'sw',
    tip: '2026-01-11T01:00:00.000Z',
    seasonType: 'postseason',
    round: 'WC',
    home: 'CHI',
    away: 'GB',
    statusLabel: 'Sun 4:30 PM',
  }

  it('renders a live badge and a scheduled status label', () => {
    const { container } = render(<Bracket games={[...REG, liveWC, scheduledWC]} tz={TZ} />)
    expect(container.querySelector('.bx-match-live')).toBeTruthy()
    expect(screen.getByText(/LIVE/)).toBeInTheDocument()
    expect(screen.getByText('Q3 7:12')).toBeInTheDocument()
    expect(screen.getByText('Sun 4:30 PM')).toBeInTheDocument()
  })
})
