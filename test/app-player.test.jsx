import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// A single committed leader, so the stats leaderboard has a clickable player and the
// App's player pop-out can be opened and closed end to end. app.test.jsx deliberately
// runs against the empty offseason table, so this lives in its own file with the mock.
const H = vi.hoisted(() => ({
  players: [{ id: 'p1', name: 'Pat QB', short: 'P.QB', team: 'KC', pos: 'QB', passYds: 4200, passTD: 35, gp: 17 }],
}))
vi.mock('../src/data/leaders.js', () => ({ PLAYERS: H.players }))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <App />
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App — player pop-out', () => {
  it('opens a leaderboard player and closes it again', async () => {
    const user = userEvent.setup()
    await mount()

    await user.click(screen.getByRole('button', { name: /Stats/ }))
    // The player leads more than one passing category, so take the first name button.
    await user.click(screen.getAllByRole('button', { name: 'Pat QB' })[0])

    const dialog = await screen.findByRole('dialog', { name: 'Pat QB' })
    expect(dialog).toBeInTheDocument()
    // Committed stat tile is shown immediately.
    expect(within(dialog).getByText('4200')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Pat QB' })).not.toBeInTheDocument()
  })
})
