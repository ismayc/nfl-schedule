import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import ScheduleView from '../src/components/ScheduleView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

const TZ = 'UTC'

// Two days AHEAD of the clock: this viewer's default schedule is "today onward", so
// a past-dated fixture renders nothing at all. Anchored relative to the real clock so
// it never goes stale as the season moves (the nightly refresh must not freeze this).
// They carry scores because the spoiler-override cases need something to hide.
const daysAhead = (n, h = 18) => {
  const d = new Date(Date.now() + n * 86400000)
  d.setUTCHours(h, 0, 0, 0)
  return d.toISOString()
}

const GAMES = [
  { id: 'a1', tip: daysAhead(2), home: 'KC', away: 'BUF', score: [90, 82], venue: 'V', city: 'C' },
  { id: 'a2', tip: daysAhead(2, 20), home: 'PHI', away: 'SF', score: [77, 70], venue: 'V', city: 'C' },
  { id: 'b1', tip: daysAhead(3), home: 'SF', away: 'NYG', score: [88, 85], venue: 'V', city: 'C' },
]

const draw = (props = {}) =>
  render(
    <FollowProvider>
      <ServicesProvider>
        <ScheduleView games={GAMES} tz={TZ} onOpen={() => {}} {...props} />
      </ServicesProvider>
    </FollowProvider>
  )

const days = () => [...document.querySelectorAll('.day')]

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

afterEach(() => cleanup())

describe('per-day folding', () => {
  it('folds a single day away and leaves its neighbours alone', () => {
    draw()
    const [first, second] = days()
    expect(first.querySelector('.day-games')).not.toBeNull()

    fireEvent.click(within(first).getByRole('button', { name: /^Hide games on/ }))

    expect(first.querySelector('.day-games')).toBeNull()
    expect(within(first).getByRole('button', { name: /^Show games on/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(first.querySelector('.day-caret').textContent).toBe('▸')
    // The other day is untouched — folding is per day, not a global collapse.
    expect(second.querySelector('.day-games')).not.toBeNull()
  })

  it('unfolds again on a second click', () => {
    draw()
    const first = days()[0]
    const fold = () => within(first).getByRole('button', { name: /games on/ })
    fireEvent.click(fold())
    expect(first.querySelector('.day-games')).toBeNull()
    fireEvent.click(fold())
    expect(first.querySelector('.day-games')).not.toBeNull()
    expect(first.querySelector('.day-caret').textContent).toBe('▾')
  })
})

describe('per-day spoiler override', () => {
  const scoresOn = (day) => day.querySelectorAll('.side-score').length > 0

  it('reveals one day while spoiler-free mode stays on everywhere else', () => {
    draw({ hideScores: true })
    const [first, second] = days()
    expect(scoresOn(first)).toBe(false)
    expect(scoresOn(second)).toBe(false)

    fireEvent.click(within(first).getByTitle('Show scores for this day'))

    expect(scoresOn(first)).toBe(true)
    // The override is per day — the rest of the schedule is still spoiler-free.
    expect(scoresOn(second)).toBe(false)
  })

  it('hides one day while scores are otherwise showing', () => {
    draw({ hideScores: false })
    const [first, second] = days()
    expect(scoresOn(first)).toBe(true)

    fireEvent.click(within(first).getByTitle('Hide scores for this day'))

    expect(scoresOn(first)).toBe(false)
    expect(scoresOn(second)).toBe(true)
  })

  it('toggles back to the global default', () => {
    draw({ hideScores: true })
    const first = days()[0]
    fireEvent.click(within(first).getByTitle('Show scores for this day'))
    expect(scoresOn(first)).toBe(true)
    fireEvent.click(within(first).getByTitle('Hide scores for this day'))
    expect(scoresOn(first)).toBe(false)
  })

  it('marks the eye pressed exactly when that day is hidden', () => {
    draw({ hideScores: true })
    const first = days()[0]
    expect(within(first).getByRole('button', { name: '🙈' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(within(first).getByTitle('Show scores for this day'))
    expect(within(first).getByRole('button', { name: '👁' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})

describe('folding inside the full-season view', () => {
  it('works within an expanded month too', () => {
    draw({ showPast: true })
    const open = days()
    expect(open.length).toBeGreaterThan(0)
    const first = open[0]
    fireEvent.click(within(first).getByRole('button', { name: /^Hide games on/ }))
    expect(first.querySelector('.day-games')).toBeNull()
  })
})
