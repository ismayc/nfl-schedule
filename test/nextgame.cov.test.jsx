import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import NextGame from '../src/components/NextGame.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const TZ = 'America/New_York'

// Pinned so every countdown assertion is exact — liveState and the 1s ticker both read
// the wall clock, and a real clock makes the seconds digit flake.
const NOW = new Date('2026-07-19T16:00:00.000Z')

const game = (over) => ({
  id: 'g1',
  tip: '2026-07-19T18:00:00.000Z',
  seasonType: 'regular',
  home: 'KC',
  away: 'BUF',
  venue: 'Arrowhead Stadium',
  city: 'Kansas City',
  ...over,
})

const draw = (games, followed = []) => {
  localStorage.setItem('nfl:followed', JSON.stringify(followed))
  return render(
    <FollowProvider>
      <NextGame games={games} tz={TZ} />
    </FollowProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('NextGame', () => {
  it('counts down to the next game and names neither team as a favourite', () => {
    draw([game()])
    expect(screen.getByText('⏱ Next game')).toBeInTheDocument()
    // 16:00 → 18:00 is exactly two hours: hours+minutes, no seconds this far out.
    const cd = screen.getByLabelText('time until kickoff')
    expect(cd.textContent).toBe('2h0m')
    expect(screen.getByText(/Kansas City/)).toBeInTheDocument()
  })

  it('drops to days+hours beyond a day, and to minutes+seconds inside the last hour', () => {
    const { unmount } = draw([game({ tip: '2026-07-21T18:00:00.000Z' })])
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('2d2h')
    unmount()

    draw([game({ tip: '2026-07-19T16:30:00.000Z' })])
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('30m0s')
  })

  it('prefers a followed team’s next game over an earlier one', () => {
    draw(
      [
        game({ id: 'early', tip: '2026-07-19T17:00:00.000Z', home: 'PHI', away: 'SF' }),
        game({ id: 'mine', tip: '2026-07-19T23:00:00.000Z', home: 'KC', away: 'BUF' }),
      ],
      ['KC']
    )
    expect(screen.getByText('⭐ Your next game')).toBeInTheDocument()
    expect(screen.getByText('Chiefs')).toBeInTheDocument()
    expect(screen.queryByText('Cowboys')).toBeNull()
  })

  it('stacks every game sharing the earliest tip when no team is followed', () => {
    draw([
      game({ id: 'a', home: 'KC', away: 'BUF' }),
      game({ id: 'b', home: 'PHI', away: 'SF' }),
      game({ id: 'c', tip: '2026-07-19T23:00:00.000Z', home: 'SF', away: 'NYG' }),
    ])
    expect(screen.getByText('⏱ Next games')).toBeInTheDocument()
    expect(screen.getByText('2 at once')).toBeInTheDocument()
    // The later game is not in the stack, and one shared countdown covers both.
    expect(screen.queryByText('Giants')).toBeNull()
    expect(screen.getAllByLabelText('time until kickoff')).toHaveLength(1)
  })

  it('a live game takes over from an upcoming one', () => {
    draw([
      game({ id: 'live', live: true, period: 3, statusLabel: 'Q3 5:12' }),
      game({ id: 'later', tip: '2026-07-19T23:00:00.000Z', home: 'PHI', away: 'SF' }),
    ])
    expect(screen.getByText('🔴 Live now')).toBeInTheDocument()
    expect(screen.getByText('● Q3')).toBeInTheDocument()
    expect(screen.queryByLabelText('time until kickoff')).toBeNull()
  })

  it('stacks several live games, with a period badge on each', () => {
    const { container } = draw([
      game({ id: 'l1', live: true, period: 1, statusLabel: 'Q1 8:00' }),
      game({ id: 'l2', live: true, period: 4, statusLabel: 'Q4 1:02', home: 'PHI', away: 'SF' }),
    ])
    expect(screen.getByText('2 games')).toBeInTheDocument()
    expect(container.querySelectorAll('.live-badge')).toHaveLength(2)
    // A live stack has no countdown — there is nothing left to count down to.
    expect(screen.queryByLabelText('time until kickoff')).toBeNull()
  })

  it('a followed team playing live wins outright over the other live games', () => {
    draw(
      [
        game({ id: 'l1', live: true, period: 1, home: 'PHI', away: 'SF' }),
        game({ id: 'mine', live: true, period: 2, home: 'KC', away: 'BUF' }),
      ],
      ['BUF']
    )
    expect(screen.getByText('🔴 Live now')).toBeInTheDocument()
    expect(screen.getByText('Bills')).toBeInTheDocument()
    expect(screen.queryByText('Cowboys')).toBeNull()
  })

  it('falls back to the raw abbreviation when the feed ships no name either', () => {
    draw([game({ home: 'ZZZ', away: 'YYY' })])
    expect(screen.getByText('ZZZ')).toBeInTheDocument()
    expect(screen.getByText('YYY')).toBeInTheDocument()
  })

  it('scrolls to the game’s day, and does nothing when that day is not rendered', () => {
    const day = document.createElement('div')
    // ScheduleView tags each day section with this id; the tip is 2pm ET on the 19th.
    day.id = 'day-2026-07-19'
    document.body.appendChild(day)
    draw([game()])
    fireEvent.click(screen.getByText('Jump to it ↓'))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })

    Element.prototype.scrollIntoView.mockClear()
    day.remove()
    cleanup()
    draw([game()])
    fireEvent.click(screen.getByText('Jump to it ↓'))
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('jumps from a stacked row too', () => {
    const day = document.createElement('div')
    day.id = 'day-2026-07-19'
    document.body.appendChild(day)
    draw([
      game({ id: 'a', home: 'KC', away: 'BUF' }),
      game({ id: 'b', home: 'PHI', away: 'SF' }),
    ])
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    day.remove()
  })

  it('ticks every second inside the last hour', async () => {
    draw([game({ tip: '2026-07-19T16:30:00.000Z' })])
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('30m0s')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('29m59s')
  })

  it('ticks only every half-minute when the next game is further out', async () => {
    draw([game()])
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('2h0m')
    // One second of wall clock moves nothing: no seconds digit is on screen, so the
    // banner deliberately isn't re-rendering at 1 Hz.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('2h0m')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('1h59m')
  })

  // The staleness bug the per-render clock was added to fix: `now` is read on every
  // render, not held in state, so a re-render triggered by anything else shows the
  // real remaining time instead of one pinned to mount.
  it('refreshes the countdown on a re-render caused by something other than its timer', () => {
    const { rerender } = draw([game()])
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('2h0m')
    // Wall clock moves, the banner's own 30s interval has NOT fired, and an unrelated
    // prop change forces a render.
    vi.setSystemTime(new Date('2026-07-19T16:45:00.000Z'))
    rerender(
      <FollowProvider>
        <NextGame games={[game()]} tz="America/Chicago" />
      </FollowProvider>
    )
    expect(screen.getByLabelText('time until kickoff').textContent).toBe('1h15m')
  })

  it('says the season is done when nothing is live or upcoming', () => {
    // Played, postponed, and already-tipped-but-not-ticking all fail to qualify.
    draw([
      game({ id: 'done', score: [90, 82] }),
      game({ id: 'off', postponed: true }),
      game({ id: 'stale', tip: '2026-07-19T15:30:00.000Z' }),
    ])
    expect(screen.getByText(/see you next season/)).toBeInTheDocument()
  })
})
