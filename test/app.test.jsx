import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// These tests need a board with nothing played: the live-overlay cases mark GAMES[0]
// in progress, and the overlay correctly refuses to do that to a game that already
// carries a committed final score. src/data/schedule.js stops being that board the
// moment week 1 is over, so App gets the frozen preseason copy instead.
vi.mock('../src/data/schedule.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/preseason-2026.js')).GAMES_2026_PRESEASON,
}))
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { VIEWS } from '../src/utils/urlState.js'
import { GAMES_2026_PRESEASON as GAMES } from './fixtures/preseason-2026.js'

// App is the wiring layer: polling, filters, URL state, and which view is on screen.
// These integration tests drive that wiring against the frozen preseason snapshot (all
// upcoming games, empty standings), re-stubbing fetch where the live overlay matters.

const renderApp = () => render(
  <FollowProvider>
    <ServicesProvider>
      <App />
    </ServicesProvider>
  </FollowProvider>
)

// Flush the mount-time poll so its setState lands inside act().
const mount = async () => {
  const utils = renderApp()
  await act(async () => {})
  return utils
}

const search = () => new URLSearchParams(window.location.search)

// The team select / My teams controls live in the filter panel, collapsed unless a
// team/followed filter is already active on load; open it before reaching inside.
const openFilters = () => userEvent.click(screen.getByRole('button', { name: /⚙ Filters/ }))

// Pin the clock as well as the board.
//
// Freezing the preseason schedule above is only half the job. What the schedule
// shows is a comparison against Date.now(), so once the real clock passes the
// 2026 season the frozen games are all in the past and the card count these
// tests assert on drops to zero. Verified by rehearsal: green today, six of
// these failing from February 2027 on, with the fixture untouched.
//
// Only Date is faked here, so the tests below that drive setInterval install
// their own full fake timers as before.
const NOW = new Date('2026-09-06T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  delete document.documentElement.dataset.theme
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock')
  globalThis.URL.revokeObjectURL = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('App — shell and navigation', () => {
  it('mounts on the schedule with the season title', async () => {
    await mount()
    expect(screen.getByRole('heading', { level: 1, name: /NFL Schedule/i })).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Schedule/ })).toHaveAttribute('aria-current', 'page')
  })

  it('switches through every view and records it in the URL', async () => {
    await mount()
    const nav = screen.getByRole('navigation', { name: /views/i })
    for (const v of VIEWS.filter((v) => v.id !== 'schedule')) {
      const label = v.label.replace(/^\W+\s*/, '')
      await userEvent.click(within(nav).getByRole('button', { name: new RegExp(label, 'i') }))
      await waitFor(() => expect(search().get('view')).toBe(v.id))
    }
    // Back to the default view drops the param.
    await userEvent.click(within(nav).getByRole('button', { name: /📋 Schedule/ }))
    await waitFor(() => expect(search().get('view')).toBeNull())
  })

  it('shows the filter bar only on schedule/week views', async () => {
    await mount()
    expect(screen.getByRole('button', { name: /⚙ Filters/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Standings/ }))
    expect(screen.queryByRole('button', { name: /⚙ Filters/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /📆 Week/ }))
    expect(screen.getByRole('button', { name: /⚙ Filters/ })).toBeInTheDocument()
  })

  it('restores view, spoiler mode, and timezone from a shared link', async () => {
    window.history.replaceState(null, '', '/?view=standings&hide=1&tz=America/Chicago')
    await mount()
    expect(screen.getByRole('heading', { name: /Regular Season/i })).toBeInTheDocument()
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByDisplayValue('Central')).toBeInTheDocument()
  })

  it('honours a pre-set theme attribute', async () => {
    document.documentElement.dataset.theme = 'light'
    await mount()
    expect(screen.getByTitle('Toggle theme')).toHaveTextContent('🌙')
  })
})

describe('App — filters', () => {
  it('filters the schedule by team and clears it', async () => {
    await mount()
    const before = document.querySelectorAll('.game').length
    await openFilters()
    await userEvent.selectOptions(screen.getByLabelText('Team'), 'KC')
    await waitFor(() => expect(search().get('team')).toBe('KC'))
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
    // The team-specific Clear chip drops just the team filter.
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(search().get('team')).toBeNull())
  })

  it('changes the timezone', async () => {
    await mount()
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'Europe/London')
    expect(screen.getByDisplayValue('London')).toBeInTheDocument()
  })

  it('offers a "My teams" chip once a team is followed and narrows the list', async () => {
    localStorage.setItem('nfl:followed', JSON.stringify(['KC']))
    await mount()
    const all = document.querySelectorAll('.game').length
    await openFilters()
    const chip = screen.getByRole('button', { name: /My teams/ })
    await userEvent.click(chip)
    await waitFor(() => expect(search().get('mine')).toBe('1'))
    const mine = document.querySelectorAll('.game').length
    expect(mine).toBeGreaterThan(0)
    expect(mine).toBeLessThan(all)
  })
})

describe('App — the collapsible filter bar', () => {
  it('is collapsed by default and toggles open/closed with aria-expanded', async () => {
    await mount()
    const toggle = screen.getByRole('button', { name: /⚙ Filters/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Search games')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Search games')).toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Search games')).not.toBeInTheDocument()
  })

  it('auto-opens the panel when a shared link already carries a team filter', async () => {
    window.history.replaceState(null, '', '/?team=KC')
    await mount()
    // Open on load, with the active-filter badge reflecting the team filter.
    expect(screen.getByLabelText('Search games')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /⚙ Filters/ })).getByText('1')).toBeInTheDocument()
  })

  it('auto-opens the panel from a followed-only shared link', async () => {
    window.history.replaceState(null, '', '/?mine=1')
    await mount()
    expect(screen.getByLabelText('Search games')).toBeInTheDocument()
  })

  it('narrows the schedule as you type a scoped query, then Clear all resets it', async () => {
    await mount()
    const before = document.querySelectorAll('.game').length
    await openFilters()
    await userEvent.type(screen.getByLabelText('Search games'), 'team: Chiefs')

    const narrowed = document.querySelectorAll('.game').length
    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(before)
    expect(within(screen.getByRole('button', { name: /⚙ Filters/ })).getByText('1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByLabelText('Search games')).toHaveValue('')
    expect(document.querySelectorAll('.game').length).toBe(before)
  })

  it('fills the search box from an example hint chip', async () => {
    await mount()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: 'team: Chiefs' }))
    expect(screen.getByLabelText('Search games')).toHaveValue('team: Chiefs')
  })
})

describe('App — the "On my services" filter', () => {
  it('offers "Choose my services" until services are picked, then filters', async () => {
    await mount()
    await openFilters()
    // Nothing chosen yet → the picker prompt, no On-my-services toggle.
    expect(screen.getByRole('button', { name: /Choose my services/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /On my services/ })).not.toBeInTheDocument()

    // Open the picker and select a single streaming service (Prime = Thursday games).
    await userEvent.click(screen.getByRole('button', { name: /Choose my services/ }))
    const dialog = screen.getByRole('dialog', { name: 'My services' })
    await userEvent.click(within(dialog).getByText('Prime Video'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    const before = document.querySelectorAll('.game').length
    const chip = screen.getByRole('button', { name: /On my services \(1\)/ })
    await userEvent.click(chip)
    await waitFor(() => expect(chip).toHaveAttribute('aria-pressed', 'true'))
    expect(localStorage.getItem('nfl:watchOnly')).toBe('1')

    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before) // Prime carries only a slice of the season
    // The Prime games that survived show the personalized 📺 badge.
    expect(document.querySelectorAll('.watch').length).toBeGreaterThan(0)
  })

  it('remembers the watch filter across a reload and auto-opens the panel', async () => {
    localStorage.setItem('nfl:services', JSON.stringify(['prime']))
    localStorage.setItem('nfl:watchOnly', '1')
    await mount()
    // Auto-opened because a device-remembered watch filter is active.
    expect(screen.getByRole('button', { name: /On my services/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // Clear all switches it off and writes the preference back.
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('button', { name: /On my services/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(localStorage.getItem('nfl:watchOnly')).toBe('0')
  })

  it('edits services from the ⚙ button next to the toggle', async () => {
    localStorage.setItem('nfl:services', JSON.stringify(['prime']))
    await mount()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: 'Edit my services' }))
    expect(screen.getByRole('dialog', { name: 'My services' })).toBeInTheDocument()
  })

  it('still toggles the watch filter when storage refuses the write', async () => {
    localStorage.setItem('nfl:services', JSON.stringify(['prime']))
    await mount()
    await openFilters()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const chip = screen.getByRole('button', { name: /On my services/ })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    // Toggling back off exercises the other arm of the persisted value.
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('still clears filters when storage refuses the write', async () => {
    localStorage.setItem('nfl:services', JSON.stringify(['prime']))
    localStorage.setItem('nfl:watchOnly', '1')
    await mount()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('button', { name: /On my services/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})

describe('App — spoiler, alerts, theme', () => {
  it('toggles spoiler-free mode into the URL', async () => {
    await mount()
    const btn = screen.getByTitle('Spoiler-free mode')
    await userEvent.click(btn)
    await waitFor(() => expect(search().get('hide')).toBe('1'))
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('persists live alerts to localStorage both ways', async () => {
    await mount()
    await userEvent.click(screen.getByTitle('Live alerts off'))
    expect(localStorage.getItem('nfl:alerts')).toBe('1')
    expect(screen.getByTitle('Live alerts on')).toBeInTheDocument()
    // Toggle back off to cover the other arm of the persisted value.
    await userEvent.click(screen.getByTitle('Live alerts on'))
    expect(localStorage.getItem('nfl:alerts')).toBe('0')
    expect(screen.getByTitle('Live alerts off')).toBeInTheDocument()
  })

  it('flips the theme and persists it', async () => {
    await mount()
    // Starts dark (no data-theme attribute set). First click → light, second → dark.
    await userEvent.click(screen.getByTitle('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('nfl:theme')).toBe('light')
    await userEvent.click(screen.getByTitle('Toggle theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('nfl:theme')).toBe('dark')
  })
})

describe('App — storage failures are swallowed', () => {
  it('defaults alerts off when storage is unreadable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await mount()
    expect(screen.getByTitle('Live alerts off')).toBeInTheDocument()
  })

  it('still flips the theme when the write throws', async () => {
    await mount()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const before = document.documentElement.dataset.theme
    await userEvent.click(screen.getByTitle('Toggle theme'))
    expect(document.documentElement.dataset.theme).not.toBe(before)
  })

  it('still toggles alerts when the write throws', async () => {
    await mount()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await userEvent.click(screen.getByTitle('Live alerts off'))
    expect(screen.getByTitle('Live alerts on')).toBeInTheDocument()
  })
})

describe('App — calendar', () => {
  it('opens the calendar modal and downloads the full season', async () => {
    await mount()
    await userEvent.click(screen.getByRole('button', { name: '📅 Calendar' }))
    const dialog = screen.getByRole('dialog', { name: 'Calendar' })
    await userEvent.click(within(dialog).getByRole('button', { name: /All games \(\d+\)/ }))
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
  })

  it('offers a current-filter download once a team filter is set, then closes', async () => {
    await mount()
    await openFilters()
    await userEvent.selectOptions(screen.getByLabelText('Team'), 'KC')
    await userEvent.click(screen.getByRole('button', { name: '📅 Calendar' }))
    const dialog = screen.getByRole('dialog', { name: 'Calendar' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Current filter \(\d+\)/ }))
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Calendar' })).not.toBeInTheDocument()
  })
})

describe('App — game detail from the schedule', () => {
  it('opens a game, jumps to a team schedule, and closes', async () => {
    await mount()
    await userEvent.click(document.querySelector('.game'))
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    expect(dialog).toBeInTheDocument()
    // Jump to the away team's schedule via a detail chip → sets the team filter.
    await userEvent.click(within(dialog).getAllByRole('button', { name: /schedule$/ })[0])
    await waitFor(() => expect(search().get('team')).toBeTruthy())
    // Re-open and close via the ✕.
    await userEvent.click(document.querySelector('.game'))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Game detail' })).not.toBeInTheDocument()
  })
})

describe('App — team panel from the standings', () => {
  it('opens the panel, follows the full schedule, and closes', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    await userEvent.click(document.querySelector('.team-btn'))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByRole('heading', { level: 3 })).toBeInTheDocument()
    // "Full schedule" routes back to the schedule view with that team filtered.
    await userEvent.click(within(panel).getByRole('button', { name: /Full schedule/ }))
    await waitFor(() => expect(search().get('view')).toBeNull())
    expect(search().get('team')).toBeTruthy()
  })

  it('dismisses the panel with the ✕', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    await userEvent.click(document.querySelector('.team-btn'))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('App — the live overlay', () => {
  const GID = GAMES[0].id
  const GID2 = GAMES[1].id
  const ev = (completed) => [
    {
      id: GID,
      competitions: [
        {
          competitors: [
            { homeAway: 'home', score: { value: 14 } },
            { homeAway: 'away', score: { value: 10 } },
          ],
          status: {
            type: { state: completed ? 'post' : 'in', shortDetail: completed ? 'Final' : 'Q3 8:24', completed },
            period: completed ? 4 : 3,
            displayClock: '8:24',
          },
        },
      ],
    },
  ]

  // A second committed game, so one poll can raise two moments at once.
  const ev2 = (completed) => ev(completed).map((e) => ({ ...e, id: GID2 }))

  it('renders committed data even when the feed is down', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    await mount()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(document.querySelectorAll('.game').length).toBeGreaterThan(0)
  })

  it('ignores a poll that resolves after unmount', async () => {
    const resolvers = []
    fetch.mockImplementation(
      () => new Promise((res) => resolvers.push(() => res({ ok: true, json: async () => ({ events: [] }) })))
    )
    const { unmount } = renderApp()
    unmount()
    await act(async () => {
      resolvers.forEach((r) => r())
    })
    // No throw / no act warning means the aborted-signal guard skipped the setState.
    expect(true).toBe(true)
  })

  it('surfaces a live game, raises an alert toast, and opens/dismisses it', async () => {
    vi.useFakeTimers()
    localStorage.setItem('nfl:alerts', '1')
    // Follow the live game's team so the alert diff runs with a team filter (not null).
    localStorage.setItem('nfl:followed', JSON.stringify([GAMES[0].home]))
    // The first poll takes the game from committed-upcoming to live → a "kickoff" alert.
    fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ events: ev(false) }) }))

    renderApp()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText(/live now/)).toBeInTheDocument()
    expect(screen.getByText(/Updated/)).toBeInTheDocument()

    const toasts = screen.getByRole('status')
    expect(within(toasts).getByText('Kickoff')).toBeInTheDocument()

    // Clicking the toast body opens the game detail.
    await act(async () => {
      fireEvent.click(within(toasts).getByRole('button', { name: /Kickoff/ }))
    })
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()

    // Dismissing removes the toast.
    await act(async () => {
      fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('retires a toast on its own, then polls again on the live cadence', async () => {
    vi.useFakeTimers()
    localStorage.setItem('nfl:alerts', '1')
    fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ events: ev(false) }) }))

    renderApp()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Nobody dismissed it; the 9s timeout drops it off the bottom of the stack.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // A game is live, so the interval runs at the 30s cadence rather than 2 minutes.
    const before = fetch.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000)
    })
    expect(fetch.mock.calls.length).toBeGreaterThan(before)
  })

  it('stacks a second moment on top of a toast already showing', async () => {
    localStorage.setItem('nfl:alerts', '1')
    // Each poll fans out over three days, so gate by round: round 1 kicks the game
    // off, round 2 finals it. Going live flips nLive, which re-runs the poll effect
    // immediately — the only gap narrower than the 9s toast TTL. Holding round 2
    // until the kickoff toast is up keeps the two on screen together.
    let release
    const gate = new Promise((r) => { release = r })
    let calls = 0
    fetch.mockImplementation(async () => {
      calls += 1
      if (calls <= 3) return { ok: true, json: async () => ({ events: ev(false) }) }
      await gate
      return { ok: true, json: async () => ({ events: ev(true) }) }
    })

    renderApp()
    // The default 1s findBy window is tight for a full mount plus a three-day poll
    // on a loaded CI runner; the whole file already allows far longer.
    const stack = await screen.findByRole('status', {}, { timeout: 10_000 })
    expect(stack).toHaveTextContent('Kickoff')
    release()
    // The final lands on top of the kickoff still showing — the only time the
    // already-seen key set is built from a non-empty stack.
    await waitFor(() => expect(stack).toHaveTextContent('Final'), { timeout: 10_000 })
    expect(stack).toHaveTextContent('Kickoff')
  })
})

describe('game deep link', () => {
  it('opens straight onto the linked game detail, then drops the one-shot param', async () => {
    window.history.replaceState(null, '', `/?game=${GAMES[0].id}`)
    await mount()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // The param is read-only: the first URL write returns to plain filter state.
    expect(search().get('game')).toBeNull()
  })

  it('ignores a deep link to a game not in the committed season', async () => {
    window.history.replaceState(null, '', '/?game=000000')
    await mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
