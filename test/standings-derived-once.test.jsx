import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// Count every call to playoffPicture without changing what it does. It runs the whole
// tiebreaker chain and the clinch/elimination solver over the season: about 3ms on a
// 1200-game board, which is not free on a live poll every 30 seconds.
const calls = { playoffPicture: 0 }
vi.mock('../src/utils/standings.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    playoffPicture: (...args) => {
      calls.playoffPicture++
      return real.playoffPicture(...args)
    },
  }
})

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

// This app opens on the schedule view, which scrolls the current day into view.
// jsdom has no scrollIntoView; the sibling app tests stub it the same way.
Element.prototype.scrollIntoView = vi.fn()

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>,
  )
  await act(async () => {})
  return utils
}

// StandingsView, StatsView and TeamPanel each used to derive the race themselves.
// TeamPanel's memo was the expensive one: it ran on every `games` change even while the
// panel was CLOSED, because the `if (!abbr || !row) return null` guard sits below the
// hooks. App derives it once now and passes it down.
describe('the playoff picture is derived once', () => {
  beforeEach(() => {
    calls.playoffPicture = 0
  })

  it('runs the solver once on first paint, not once per consumer', async () => {
    await mount()
    expect(calls.playoffPicture).toBe(1)
  })

  it('does not run it again just because a panel is mounted but closed', async () => {
    await mount()
    const afterMount = calls.playoffPicture
    // TeamPanel is rendered unconditionally with abbr=null; it must contribute nothing.
    await act(async () => {})
    expect(calls.playoffPicture).toBe(afterMount)
  })

  it('shares one derivation with the standings view rather than adding another', async () => {
    await mount()
    const before = calls.playoffPicture
    const tab = screen.queryByRole('button', { name: /standings/i })
    if (tab) {
      await act(async () => userEvent.click(tab))
    }
    // Switching views renders a new consumer of the race, but `games` has not changed,
    // so App's memo holds and no second solver run happens.
    expect(calls.playoffPicture).toBe(before)
  })
})
