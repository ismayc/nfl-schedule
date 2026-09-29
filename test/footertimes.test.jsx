import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

import App from '../src/App.jsx'
import FooterTimes from '../src/components/FooterTimes.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { formatStamp } from '../src/utils/time.js'
import { DATA_UPDATED_AT } from './fixtures/frozen/meta.js'

// Every render here pins the clock: the frozen board read at the real clock is what
// reddened a WNBA test on October 2, 2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-05T18:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('formatStamp', () => {
  it('formats an instant in the given zone', () => {
    expect(formatStamp('2026-09-28T23:49:35.000Z', 'America/Los_Angeles')).toBe('Sep 28, 4:49 PM')
    expect(formatStamp('2026-09-28T23:49:35.000Z', 'America/New_York')).toBe('Sep 28, 7:49 PM')
  })

  // new Date(null) is the epoch, and new Date('') or garbage is Invalid Date. Neither
  // may reach the page.
  it('gives null for a missing or unparseable stamp', () => {
    for (const bad of [undefined, null, '', 'not a date']) expect(formatStamp(bad, 'UTC')).toBeNull()
  })
})

describe('FooterTimes', () => {
  const at = new Date('2026-09-29T17:32:00.000Z')

  it('labels both clocks, in the selected zone', () => {
    const { container } = render(
      <FooterTimes dataAt="2026-09-28T23:49:35.000Z" checkedAt={at} tz="America/Los_Angeles" />
    )
    expect(container.textContent).toBe('Data as of Sep 28, 4:49 PM · Live scores checked 10:32 AM')
    expect(container.querySelector('span.dim')).not.toBeNull()
  })

  it('shows the data stamp alone before the first live poll lands', () => {
    const { container } = render(<FooterTimes dataAt="2026-09-28T23:49:35.000Z" checkedAt={null} tz="UTC" />)
    expect(container.textContent).toBe('Data as of Sep 28, 11:49 PM')
  })

  it('drops a missing or unparseable stamp rather than printing a wrong date', () => {
    for (const bad of [undefined, null, 'garbage']) {
      const { container, unmount } = render(<FooterTimes dataAt={bad} checkedAt={at} tz="UTC" />)
      expect(container.textContent).toBe('Live scores checked 5:32 PM')
      expect(container.textContent).not.toMatch(/Invalid|1969|1970|Data as of/)
      unmount()
    }
  })

  it('renders nothing when neither time is known', () => {
    const { container } = render(<FooterTimes dataAt={null} checkedAt={null} tz="UTC" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('the app footer', () => {
  it('shows the committed snapshot time in the selected zone', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    localStorage.clear()
    window.history.replaceState(null, '', '/?tz=America/New_York')
    // An empty scoreboard: the poll still succeeds, so both clocks are shown.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
    render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
    await act(async () => {})
    const expected = `Data as of ${formatStamp(DATA_UPDATED_AT, 'America/New_York')}`
    expect(expected).toBe('Data as of Sep 4, 9:05 AM')
    // The pinned clock, 18:00 UTC, is 2:00 PM in New York.
    expect(screen.getByText(`${expected} · Live scores checked 2:00 PM`)).toHaveClass('dim')
    window.history.replaceState(null, '', '/')
  })
})
