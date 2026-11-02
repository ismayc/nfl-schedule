import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES_2025 } from './fixtures/season-2025.js'
import { GAMES_2026_PRESEASON } from './fixtures/preseason-2026.js'

const TZ = 'America/New_York'

const REG = GAMES_2025.filter((g) => g.seasonType === 'regular')

afterEach(cleanup)
beforeEach(() => localStorage.clear())

// Below 720px the seven-column tree printed over itself: round headers on top of each
// other and cards covering cards. Phones get one round at a time instead.
describe('Bracket on a phone', () => {
  const realMatchMedia = window.matchMedia
  let fire
  let matches
  beforeEach(() => {
    matches = true
    window.matchMedia = vi.fn(() => ({
      get matches() {
        return matches
      },
      addEventListener: (_, fn) => {
        fire = fn
      },
      removeEventListener: () => {},
    }))
  })
  afterEach(() => {
    window.matchMedia = realMatchMedia
  })
  const tab = (name) => screen.getByRole('tab', { name })

  it('drops the tree and opens a finished postseason on the Super Bowl', () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} />)
    expect(container.querySelector('.bx-bracket')).toBeNull()
    expect(tab('Super Bowl')).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelectorAll('.bx-mobile-list .bx-match')).toHaveLength(1)
    expect(container.querySelector('.bx-mobile-list .bx-sb-champ')).toHaveTextContent('Seahawks')
  })

  it('shows each round for both conferences, with the byes under the Wild Card', async () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} />)
    const cards = () => container.querySelectorAll('.bx-mobile-list .bx-match').length
    await userEvent.click(tab('Wild Card'))
    expect(cards()).toBe(6)
    expect(screen.getAllByText('Bye')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'AFC' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'NFC' })).toBeInTheDocument()
    await userEvent.click(tab('Divisional'))
    expect(cards()).toBe(4)
    expect(screen.queryByText('Bye')).not.toBeInTheDocument()
    await userEvent.click(tab('Conference'))
    expect(cards()).toBe(2)
  })

  it('opens on the Wild Card while no game is played, and shows no champion', () => {
    const { container } = render(<Bracket games={REG} tz={TZ} />)
    expect(tab('Wild Card')).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('.bx-match-proj')).toBeTruthy()
    expect(container.querySelector('.bx-sb-champ')).toBeNull()
  })

  it('opens on the Wild Card in spoiler-free mode, so the tab leaks no result', () => {
    render(<Bracket games={GAMES_2025} tz={TZ} hideScores />)
    expect(tab('Wild Card')).toHaveAttribute('aria-selected', 'true')
  })

  it('shows no champion on an undecided Super Bowl', async () => {
    const { container } = render(<Bracket games={REG} tz={TZ} />)
    await userEvent.click(tab('Super Bowl'))
    expect(container.querySelectorAll('.bx-mobile-list .bx-match')).toHaveLength(1)
    expect(container.querySelector('.bx-sb-champ')).toBeNull()
  })

  it('returns to the tree when the screen widens', () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} />)
    matches = false
    act(() => fire())
    expect(container.querySelector('.bx-bracket')).toBeTruthy()
  })
})

describe('Bracket — before the season starts', () => {
  it('shows the placeholder card on the empty 2026 snapshot', () => {
    render(<Bracket games={GAMES_2026_PRESEASON} tz={TZ} />)
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
