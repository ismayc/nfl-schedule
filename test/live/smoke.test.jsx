import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../src/App.jsx'
import { FollowProvider } from '../../src/context/follow.jsx'
import { ServicesProvider } from '../../src/context/services.jsx'
import { GAMES } from '../../src/data/schedule.js'
import { TEAMS } from '../../src/data/teams.js'
import { playoffPicture } from '../../src/utils/standings.js'
import GameDetail from '../../src/components/GameDetail.jsx'
import TeamPanel from '../../src/components/TeamPanel.jsx'

// LIVE suite (npm run test:data): the whole site, mounted on the real refreshed data.
//
// The main suite used to do this job by accident: 15 of its test files imported the live
// modules, so data that broke a view failed something. Those tests read frozen data now,
// and this file does the job on purpose. It asserts nothing about WHAT the season looks
// like, only that every view renders it and that nothing on screen is the residue of a
// bad value.

// What a broken value looks like once it reaches the DOM. 1969/1970 is `new Date(null)`,
// which printed a TBC tip as December 31, 1969 in the FIBA sibling.
const RESIDUE = /\bNaN\b|\bundefined\b|\bnull\b|Invalid Date|\[object Object\]|\b19(69|70)\b/

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

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // The live overlay fires on mount; keep it inert and off the network.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('every view renders the refreshed data', () => {
  it.each([
    ['schedule', /Schedule/],
    ['week', /Week/],
    ['standings', /Standings/],
    ['playoffs', /Playoffs/],
    ['stats', /Stats/],
    ['history', /History/],
  ])('%s', async (_id, label) => {
    const { container } = await mount()
    await userEvent.click(screen.getAllByRole('button', { name: label })[0])
    const main = container.querySelector('main') ?? container
    expect(main.textContent.length).toBeGreaterThan(0)
    expect(main.textContent).not.toMatch(RESIDUE)
  })

  it('shows the whole season, past days included, without residue', async () => {
    window.history.replaceState(null, '', '/?past=1')
    const { container } = await mount()
    expect(container.textContent).not.toMatch(RESIDUE)
  })
})

describe('every game and every team opens', () => {
  it('renders the detail dialog for every game on the board', () => {
    for (const game of GAMES) {
      const { container, unmount } = render(
        <FollowProvider>
          <ServicesProvider>
            <GameDetail game={game} games={GAMES} tz="America/New_York" onClose={() => {}} />
          </ServicesProvider>
        </FollowProvider>
      )
      expect(container.textContent, `game ${game.id}`).not.toMatch(RESIDUE)
      unmount()
    }
  })

  it('renders the team panel for every team', () => {
    // Derived once and passed in, as App does, rather than once per club. TeamPanel
    // reads the follow context, whose default is null, so it needs FollowProvider.
    const picture = playoffPicture(GAMES)
    for (const t of TEAMS) {
      const { container, unmount } = render(
        <FollowProvider>
          <ServicesProvider>
            <TeamPanel abbr={t.abbr} games={GAMES} picture={picture} tz="America/New_York" onClose={() => {}} />
          </ServicesProvider>
        </FollowProvider>
      )
      expect(container.textContent, `team ${t.abbr}`).not.toMatch(RESIDUE)
      unmount()
    }
  })
})
