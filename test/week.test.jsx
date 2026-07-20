import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import WeekView from '../src/components/WeekView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'
import { GAMES_2025 } from './fixtures/season-2025.js'

// The Week view is a per-week calendar grid: day columns (Thu · Sat · Sun · Mon), with the
// Sunday slate split by Eastern-time kickoff window (early / afternoon / night). All tests
// pin tz to Eastern so the day-buckets and slots are deterministic.
const TZ = 'America/New_York'

let seq = 0
const g = (over) => ({
  id: `g${seq++}`,
  seasonType: 'regular',
  week: 3,
  home: 'KC',
  away: 'DEN',
  tip: '2026-10-18T17:00:00.000Z', // 1:00 PM ET, a Sunday → "early"
  ...over,
})

const renderWeek = (props, { followed } = {}) => {
  if (followed) localStorage.setItem('nfl:followed', JSON.stringify(followed))
  return render(
    <FollowProvider>
      <WeekView tz={TZ} onOpen={() => {}} onWeekChange={() => {}} {...props} />
    </FollowProvider>
  )
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('week selection', () => {
  it('defaults to the first week with an unplayed game', () => {
    renderWeek({ games: GAMES }) // 2026: nothing played → week 1
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Week 1')
  })

  it('falls back to the last week with games when everything is played', () => {
    renderWeek({ games: GAMES_2025 }) // completed season → week 18
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Week 18')
  })

  it('honors an explicit week prop over the default', () => {
    renderWeek({ games: GAMES, week: 9 })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Week 9')
  })

  it('shows an empty state for a week with no games, and "Week 1" when there are none at all', () => {
    renderWeek({ games: [], week: null })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Week 1')
    expect(screen.getByText('No games this week.')).toBeInTheDocument()
  })

  it('ignores postseason games and games without a week number', () => {
    renderWeek({
      games: [g({ seasonType: 'postseason', week: undefined }), g({ week: null })],
      week: 3,
    })
    expect(screen.getByText('No games this week.')).toBeInTheDocument()
  })

  it('counts games with singular/plural wording', () => {
    const { rerender } = renderWeek({ games: [g({})], week: 3 })
    expect(screen.getByText('1 game')).toBeInTheDocument()
    rerender(
      <FollowProvider>
        <WeekView tz={TZ} games={[g({}), g({ home: 'BUF', away: 'MIA' })]} week={3} onOpen={() => {}} />
      </FollowProvider>
    )
    expect(screen.getByText('2 games')).toBeInTheDocument()
  })
})

describe('day columns and kickoff slots', () => {
  it('splits a Sunday into early / afternoon / night slot labels', () => {
    renderWeek({
      games: [
        g({ tip: '2026-10-18T17:00:00.000Z' }), // 1:00 PM ET → early
        g({ home: 'BUF', away: 'MIA', tip: '2026-10-18T20:25:00.000Z' }), // 4:25 PM ET → afternoon
        g({ home: 'DAL', away: 'PHI', tip: '2026-10-19T00:20:00.000Z' }), // 8:20 PM ET Sun → night
      ],
      week: 3,
    })
    expect(screen.getByText('Early')).toBeInTheDocument()
    expect(screen.getByText('Afternoon')).toBeInTheDocument()
    expect(screen.getByText('Night')).toBeInTheDocument()
    // One day column (all three are the same Sunday in ET).
    expect(screen.getAllByText('Sunday')).toHaveLength(1)
  })

  it('gives a single-game day (Thursday night) its own column with no slot label', () => {
    renderWeek({
      games: [g({ home: 'SEA', away: 'SF', tip: '2026-10-16T00:15:00.000Z' })], // 8:15 PM ET Thu
      week: 3,
    })
    // A single-slot day shows no slot sub-header.
    expect(screen.queryByText('Night')).toBeNull()
    expect(screen.getByText('Thursday')).toBeInTheDocument()
  })

  it('renders separate columns for different days of the week', () => {
    renderWeek({
      games: [
        g({ home: 'SEA', away: 'SF', tip: '2026-10-16T00:15:00.000Z' }), // Thu
        g({ tip: '2026-10-18T17:00:00.000Z' }), // Sun
        g({ home: 'WSH', away: 'NYG', tip: '2026-10-20T00:15:00.000Z' }), // Mon
      ],
      week: 3,
    })
    expect(screen.getByText('Thursday')).toBeInTheDocument()
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getByText('Monday')).toBeInTheDocument()
  })
})

describe('game cells', () => {
  it('shows the kickoff time for an upcoming game and opens it on click', () => {
    const onOpen = vi.fn()
    renderWeek({ games: [g({})], week: 3, onOpen })
    const cell = screen.getByRole('button', { name: /DEN.*KC/s })
    expect(within(cell).getByText(/\d+:\d\d/)).toBeInTheDocument()
    fireEvent.click(cell)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ home: 'KC' }))
  })

  it('shows the final score and marks the winner, home or away', () => {
    renderWeek({ games: [g({ score: [24, 17] })], week: 3 }) // home KC wins
    const cell = screen.getByRole('button', { name: /DEN.*KC/s })
    expect(within(cell).getByText('Final')).toBeInTheDocument()
    expect(within(cell).getByText('24')).toBeInTheDocument()
    expect(within(cell).getByText('17')).toBeInTheDocument()
  })

  it('marks an away winner and shows the OT tag', () => {
    renderWeek({ games: [g({ score: [17, 24], ot: 1 })], week: 3 }) // away DEN wins in OT
    expect(screen.getByText('Final/OT')).toBeInTheDocument()
  })

  it('hides the score in spoiler-free mode', () => {
    renderWeek({ games: [g({ score: [24, 17] })], week: 3, hideScores: true })
    expect(screen.queryByText('24')).toBeNull()
    expect(screen.getByText('Final')).toBeInTheDocument()
  })

  it('shows the live status label, or a generic "Live" when none is given', () => {
    const { rerender } = renderWeek({ games: [g({ live: true, statusLabel: '3rd 8:24' })], week: 3 })
    expect(screen.getByText('3rd 8:24')).toBeInTheDocument()
    rerender(
      <FollowProvider>
        <WeekView tz={TZ} games={[g({ live: true })]} week={3} onOpen={() => {}} />
      </FollowProvider>
    )
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('labels postponed and canceled games', () => {
    renderWeek({
      games: [g({ postponed: true }), g({ home: 'BUF', away: 'MIA', canceled: true })],
      week: 3,
    })
    expect(screen.getByText('Postponed')).toBeInTheDocument()
    expect(screen.getByText('Canceled')).toBeInTheDocument()
  })

  it('highlights a cell involving a followed team', () => {
    renderWeek({ games: [g({})], week: 3 }, { followed: ['KC'] })
    const cell = screen.getByRole('button', { name: /DEN.*KC/s })
    expect(cell.className).toContain('is-mine')
  })

  it('does not throw when clicked without an onOpen handler', () => {
    render(
      <FollowProvider>
        <WeekView tz={TZ} games={[g({})]} week={3} />
      </FollowProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /DEN.*KC/s }))
  })
})

describe('byes and navigation', () => {
  it('lists teams on bye, and shows no bye strip when all 32 play', () => {
    renderWeek({ games: GAMES, week: 1 }) // week 1: everyone plays
    expect(screen.queryByText('On bye')).toBeNull()
    renderWeek({ games: GAMES, week: 6 }) // week 6 has byes
    expect(screen.getByText('On bye')).toBeInTheDocument()
  })

  it('disables prev at week 1 and next at week 18, and pages otherwise', () => {
    const onWeekChange = vi.fn()
    const { rerender } = renderWeek({ games: GAMES, week: 1, onWeekChange })
    expect(screen.getByLabelText('Previous week')).toBeDisabled()
    expect(screen.getByLabelText('Next week')).not.toBeDisabled()
    fireEvent.click(screen.getByLabelText('Next week'))
    expect(onWeekChange).toHaveBeenCalledWith(2)

    rerender(
      <FollowProvider>
        <WeekView tz={TZ} games={GAMES} week={18} onWeekChange={onWeekChange} onOpen={() => {}} />
      </FollowProvider>
    )
    expect(screen.getByLabelText('Next week')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Previous week'))
    expect(onWeekChange).toHaveBeenCalledWith(17)
  })

  it('selects a week from the pill row', () => {
    const onWeekChange = vi.fn()
    renderWeek({ games: GAMES, week: 3, onWeekChange })
    const tabs = screen.getAllByRole('tab')
    expect(tabs.find((t) => t.getAttribute('aria-selected') === 'true').textContent).toBe('3')
    fireEvent.click(tabs[6]) // week 7
    expect(onWeekChange).toHaveBeenCalledWith(7)
  })

  it('does not throw paging without an onWeekChange handler', () => {
    render(
      <FollowProvider>
        <WeekView tz={TZ} games={GAMES} week={5} onOpen={() => {}} />
      </FollowProvider>
    )
    fireEvent.click(screen.getByLabelText('Next week'))
    fireEvent.click(screen.getAllByRole('tab')[0])
  })
})
