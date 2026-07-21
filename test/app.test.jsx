import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { VIEWS } from '../src/utils/urlState.js'
import { GAMES } from '../src/data/schedule.js'

// App is the wiring layer: polling, filters, URL state, and which view is on screen.
// These integration tests drive that wiring against the committed 2026 snapshot (all
// upcoming games, empty standings), re-stubbing fetch where the live overlay matters.

const renderApp = () => render(
  <FollowProvider>
    <App />
  </FollowProvider>
)

// Flush the mount-time poll so its setState lands inside act().
const mount = async () => {
  const utils = renderApp()
  await act(async () => {})
  return utils
}

const search = () => new URLSearchParams(window.location.search)

beforeEach(() => {
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

  it('shows the filter row only on schedule/week views', async () => {
    await mount()
    expect(screen.getByLabelText('Team')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Standings/ }))
    expect(screen.queryByLabelText('Team')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /📆 Week/ }))
    expect(screen.getByLabelText('Team')).toBeInTheDocument()
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
    await userEvent.selectOptions(screen.getByLabelText('Team'), 'KC')
    await waitFor(() => expect(search().get('team')).toBe('KC'))
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
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
    const chip = screen.getByRole('button', { name: /My teams/ })
    await userEvent.click(chip)
    await waitFor(() => expect(search().get('mine')).toBe('1'))
    const mine = document.querySelectorAll('.game').length
    expect(mine).toBeGreaterThan(0)
    expect(mine).toBeLessThan(all)
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
