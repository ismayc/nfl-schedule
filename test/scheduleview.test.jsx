import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScheduleView, { RECENT_LOOKAHEAD_DAYS } from '../src/components/ScheduleView.jsx'
import { GAMES } from '../src/data/schedule.js'
import { dayKey, todayKey } from '../src/utils/time.js'
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

  it('caps the default view at a fortnight of upcoming game-days behind a Later toggle', () => {
    // 20 future game-days, two games each — the default view must show the first 14
    // days and fold the remaining 6 (12 games) behind "Later games". Without the cap
    // a fresh rollover renders the whole 272-game season on load.
    const base = Date.now()
    const wk = []
    for (let d = 1; d <= 20; d++) {
      const tip = new Date(base + d * 24 * 60 * 60 * 1000).toISOString()
      wk.push({ id: `f${d}a`, seasonType: 'regular', week: 1, tip, home: 'KC', away: 'DEN' })
      wk.push({ id: `f${d}b`, seasonType: 'regular', week: 1, tip, home: 'SF', away: 'SEA' })
    }
    const { container } = render(<ScheduleView games={wk} tz={TZ} />)
    expect(container.querySelectorAll('.day')).toHaveLength(RECENT_LOOKAHEAD_DAYS)

    const later = screen.getByRole('button', { name: /Later games/ })
    expect(within(later).getByText('12')).toBeInTheDocument()
    fireEvent.click(later)
    expect(container.querySelectorAll('.day')).toHaveLength(20)

    // The toggle flips to a collapse control and folds the tail back away.
    fireEvent.click(screen.getByRole('button', { name: /Later games/ }))
    expect(container.querySelectorAll('.day')).toHaveLength(RECENT_LOOKAHEAD_DAYS)
  })

  it('caps the committed season the same way, counts derived from the data', () => {
    // Refresh-stable: expectations come from the imported schedule, not hardcoded
    // dates. As the season plays out the upcoming window shrinks; the cap (and its
    // toggle) must engage exactly when more than a fortnight of game-days remains.
    const today = todayKey(TZ)
    const upcomingDays = new Map()
    for (const g of GAMES) {
      const key = dayKey(g.tip, TZ)
      if (key >= today) upcomingDays.set(key, (upcomingDays.get(key) ?? 0) + 1)
    }
    const dayKeys = [...upcomingDays.keys()].sort()
    const hiddenGames = dayKeys
      .slice(RECENT_LOOKAHEAD_DAYS)
      .reduce((n, k) => n + upcomingDays.get(k), 0)

    const { container } = render(<ScheduleView games={GAMES} tz={TZ} />)
    expect(container.querySelectorAll('.day')).toHaveLength(
      Math.min(dayKeys.length, RECENT_LOOKAHEAD_DAYS)
    )
    const later = screen.queryByRole('button', { name: /Later games/ })
    if (hiddenGames > 0) {
      expect(within(later).getByText(String(hiddenGames))).toBeInTheDocument()
    } else {
      expect(later).toBeNull()
    }
  })

  it('opens a game when its card is clicked', async () => {
    const onOpen = vi.fn()
    const { container } = render(<ScheduleView games={[todayGame]} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(container.querySelector('.game'))
    expect(onOpen).toHaveBeenCalledWith(todayGame)
  })
})

/* ── Full season: collapsible weeks + playoff rounds under a jump-bar ─────── */

describe('ScheduleView full season', () => {
  const g = (id, tip, extra) => ({ id, tip, home: 'KC', away: 'BUF', ...extra })
  // Two regular weeks then two playoff rounds. Week 1 spans two days (a Wednesday
  // night opener + the Sunday slate). Today (2026) is before all of it, so Week 1
  // is the landing week.
  const season = [
    g('w1a', '2026-09-10T00:20:00.000Z', { seasonType: 'regular', week: 1 }), // Sep 9 ET
    g('w1b', '2026-09-13T17:00:00.000Z', { seasonType: 'regular', week: 1, home: 'SF', away: 'SEA' }),
    g('w2a', '2026-09-17T00:20:00.000Z', { seasonType: 'regular', week: 2 }),
    g('wc', '2027-01-10T18:00:00.000Z', { seasonType: 'postseason', round: 'WC' }),
    g('sb', '2027-02-08T23:30:00.000Z', { seasonType: 'postseason', round: 'SB' }),
  ]
  const view = (games = season) => render(<ScheduleView games={games} tz={TZ} showPast />)

  it('lays weeks and playoff rounds out as chips and sections, only the landing week open', () => {
    const { container } = view()
    const chips = [...container.querySelectorAll('.month-chip:not(.month-top):not(.month-today)')]
    expect(chips.map((c) => c.textContent)).toEqual(['1', '2', 'Wild Card', 'Super Bowl'])
    expect(container.querySelectorAll('.month')).toHaveLength(4)
    // Section headers name the week or round in full, in order.
    const heads = [...container.querySelectorAll('.month-head')].map((h) => h.textContent)
    expect(heads.some((t) => t.includes('Week 1'))).toBe(true)
    expect(heads.some((t) => t.includes('Wild Card'))).toBe(true)
    expect(heads.some((t) => t.includes('Super Bowl'))).toBe(true)
    // Only Week 1 is open, and it spans its two days.
    expect(container.querySelectorAll('.month-days')).toHaveLength(1)
    expect(container.querySelectorAll('.day')).toHaveLength(2)
    // Today has no game (the season is in the future), so no chip is flagged current.
    expect(container.querySelector('.month-chip.is-current')).toBeNull()
  })

  it('groups an unrecognised playoff round under a trailing Postseason section', () => {
    const { container } = view([
      g('w1a', '2026-09-10T00:20:00.000Z', { seasonType: 'regular', week: 1 }),
      g('odd', '2027-01-20T18:00:00.000Z', { seasonType: 'postseason', round: 'XX' }),
    ])
    const chips = [...container.querySelectorAll('.month-chip:not(.month-top):not(.month-today)')]
    expect(chips.map((c) => c.textContent)).toEqual(['1', 'Postseason'])
    const heads = [...container.querySelectorAll('.month-head')].map((h) => h.textContent)
    expect(heads.some((t) => t.includes('Postseason'))).toBe(true)
  })

  it('flags the week that holds today when today has a game', () => {
    const { container } = render(<ScheduleView games={[todayGame]} tz={TZ} showPast />)
    const current = container.querySelector('.month-chip.is-current')
    expect(current).toBeTruthy()
    expect(current.textContent).toBe('1') // week 1
  })

  it('toggles a section open and shut', () => {
    const { container } = view()
    const week1 = [...container.querySelectorAll('.month-head')].find((h) =>
      h.textContent.includes('Week 1')
    )
    // Open on load; a click collapses it, another re-opens.
    fireEvent.click(week1)
    expect(container.querySelectorAll('.month-days')).toHaveLength(0)
    fireEvent.click(week1)
    expect(container.querySelectorAll('.month-days')).toHaveLength(1)
  })

  it('counts a single-game round in the singular', () => {
    const { container } = view()
    const sb = [...container.querySelectorAll('.month-head')].find((h) =>
      h.textContent.includes('Super Bowl')
    )
    fireEvent.click(sb) // expand it
    expect(within(sb).getByText('1 game')).toBeInTheDocument()
  })

  it('jumping to a collapsed week expands it and scrolls its section into view', () => {
    const spy = Element.prototype.scrollIntoView
    const { container } = view()
    const openedBefore = container.querySelectorAll('.month-days').length
    const calledBefore = spy.mock.calls.length
    // The Super Bowl chip is the last non-nav chip and starts collapsed.
    const chips = [...container.querySelectorAll('.month-chip:not(.month-top):not(.month-today)')]
    fireEvent.click(chips.at(-1))
    expect(container.querySelectorAll('.month-days').length).toBeGreaterThan(openedBefore)
    // The scrolled target is the section container (a week key, resolved via weekRefs).
    expect(spy.mock.calls.length).toBeGreaterThan(calledBefore)
    expect(spy.mock.contexts.at(-1)).toHaveClass('month')
  })

  it('Today jump scrolls to the landing day row, not a section header', () => {
    const spy = Element.prototype.scrollIntoView
    const { container } = view() // today has no game → lands on the next game-day (Week 1)
    fireEvent.click(container.querySelector('.month-today'))
    expect(spy.mock.contexts.at(-1)).toHaveClass('day')
  })

  it('has a Top jump that scrolls the page to the top', () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { container } = view()
    fireEvent.click(container.querySelector('.month-top'))
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    scrollSpy.mockRestore()
  })
})
