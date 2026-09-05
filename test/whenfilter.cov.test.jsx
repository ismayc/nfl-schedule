import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
// The contrast this file asserts (Upcoming keeps cards, Finished empties the list)
// only holds on a season with nothing played, and App reads the committed schedule
// directly. Serve it the frozen preseason board rather than the live one, which the
// refresh starts filling in the moment week 1 is over.
vi.mock('../src/data/schedule.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/preseason-2026.js')).GAMES_2026_PRESEASON,
}))
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { whenBucket } from '../src/utils/time.js'

const NOW = new Date('2026-07-19T18:00:00.000Z').getTime()

const game = (over) => ({ id: 'g', tip: '2026-07-19T18:00:00.000Z', home: 'KC', away: 'BUF', ...over })

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

// Pin the clock as well as the board.
//
// Freezing the preseason schedule above is only half the job: "upcoming" is a
// comparison against Date.now(), so once the real clock passes the 2026 opener
// every frozen game buckets as finished and the contrast this file asserts
// inverts. Verified by rehearsal: green on September 6, this file's App test
// failing from September 15 on, with the fixture untouched.
//
// Only Date is faked, so userEvent's timers and waitFor keep working.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('whenBucket', () => {
  it('reads a ticking game as live', () => {
    expect(whenBucket(game({ live: true }), NOW)).toBe('live')
  })

  it('reads a game that has tipped without a feed as live too', () => {
    // Inside the ~2h15m window liveState calls this 'likely-live' — the card shows it
    // as under way, so the filter has to agree or the chip lies about what's on screen.
    expect(whenBucket(game(), NOW + 30 * 60 * 1000)).toBe('live')
  })

  it('reads a scheduled game as upcoming', () => {
    expect(whenBucket(game(), NOW - 60 * 60 * 1000)).toBe('upcoming')
  })

  it('reads a played game as finished', () => {
    expect(whenBucket(game({ score: [90, 82] }), NOW)).toBe('final')
  })

  it('reads a long-past game with no score as finished', () => {
    expect(whenBucket(game(), NOW + 10 * 60 * 60 * 1000)).toBe('final')
  })

  it('keeps a postponed game out of all three buckets', () => {
    expect(whenBucket(game({ postponed: true }), NOW)).toBe('void')
    expect(whenBucket(game({ canceled: true }), NOW)).toBe('void')
  })
})

describe('the When filter in the app', () => {
  const openFilters = () => userEvent.click(screen.getByRole('button', { name: /⚙ Filters/ }))

  it('narrows the schedule, counts on the badge, and clears', async () => {
    await mount()
    await openFilters()
    const cardCount = () => document.querySelectorAll('article.game').length

    const upcoming = screen.getByRole('button', { name: '⏱ Upcoming' })
    expect(upcoming).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-pressed', 'true')

    // The committed 2026 season has not kicked off, so every game is upcoming — the
    // mirror image of the NBA's all-played data. "All the cards left are upcoming"
    // would therefore pass with the filter disabled, so assert the CONTRAST instead:
    // Upcoming keeps games, Finished must empty the list entirely.
    expect(cardCount()).toBeGreaterThan(0)
    for (const c of document.querySelectorAll('article.game')) {
      expect(c.className).toMatch(/state-upcoming\b/)
    }

    expect(screen.getByRole('button', { name: /⚙ Filters/ })).toHaveTextContent('1')

    await userEvent.click(screen.getByRole('button', { name: '✓ Finished' }))
    expect(cardCount()).toBe(0)
    expect(screen.getByText(/No games match those filters/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(cardCount()).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '⏱ Upcoming' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('clicking the active chip clears it instead of stacking a second bucket', async () => {
    await mount()
    await openFilters()
    const upcoming = screen.getByRole('button', { name: '⏱ Upcoming' })
    await userEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-pressed', 'false')
  })

  it('switching buckets replaces the selection', async () => {
    await mount()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    await userEvent.click(screen.getByRole('button', { name: '✓ Finished' }))
    expect(screen.getByRole('button', { name: '⏱ Upcoming' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('button', { name: '✓ Finished' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
