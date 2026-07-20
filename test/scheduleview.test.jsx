import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScheduleView from '../src/components/ScheduleView.jsx'
import { GAMES } from '../src/data/schedule.js'
import { GAMES_2025 } from './fixtures/season-2025.js'

afterEach(cleanup)
// jsdom has no layout engine, so scrollIntoView is undefined by default.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const TZ = 'America/New_York'
// tip = now, so the game buckets into the viewer's "today" in any zone.
const todayGame = {
  id: 't1',
  tip: new Date().toISOString(),
  seasonType: 'regular',
  week: 1,
  home: 'KC',
  away: 'DEN',
}

describe('ScheduleView', () => {
  it('shows an empty state when there are no games at all', () => {
    render(<ScheduleView games={[]} tz={TZ} />)
    expect(screen.getByText(/No games match those filters/i)).toBeInTheDocument()
  })

  it('groups upcoming games by day, with plural counts for busy days', () => {
    const { container } = render(<ScheduleView games={GAMES} tz={TZ} />)
    expect(container.querySelector('.schedule')).toBeTruthy()
    expect(container.querySelectorAll('.day').length).toBeGreaterThan(0)
    const counts = [...container.querySelectorAll('.day-count')].map((n) => n.textContent)
    expect(counts.some((c) => /^\d+ games$/.test(c))).toBe(true)
  })

  it('drops whole past days when showPast is off', () => {
    // The 2025 season is entirely before today's 2026 date → every day filtered out.
    render(<ScheduleView games={GAMES_2025} tz={TZ} />)
    expect(screen.getByText(/No games match those filters/i)).toBeInTheDocument()
  })

  it('keeps past days when showPast is on', () => {
    const { container } = render(<ScheduleView games={GAMES_2025} tz={TZ} showPast />)
    expect(container.querySelectorAll('.day').length).toBeGreaterThan(0)
  })

  it('marks today, counts a single game singular, and scrolls it into view', () => {
    const { container } = render(<ScheduleView games={[todayGame]} tz={TZ} showPast />)
    expect(container.querySelector('.day.is-today')).toBeTruthy()
    expect(container.querySelector('.day-count').textContent).toBe('1 game')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('opens a game when its card is clicked', async () => {
    const onOpen = vi.fn()
    const { container } = render(<ScheduleView games={[todayGame]} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(container.querySelector('.game'))
    expect(onOpen).toHaveBeenCalledWith(todayGame)
  })
})
