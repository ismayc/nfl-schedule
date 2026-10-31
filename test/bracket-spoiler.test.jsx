import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import { GAMES_2025 } from './fixtures/season-2025.js'

const TZ = 'America/New_York'
const REG = GAMES_2025.filter((g) => g.seasonType === 'regular')

afterEach(cleanup)

// Spoiler-free mode ("Hide all winners"): a bracket shows matchups, games, and dates,
// but no result. The 2025 postseason is fully decided (Seattle beat New England in the
// Super Bowl), so every result path has something to leak.
describe('Bracket in spoiler-free mode', () => {
  const teamsIn = (el) => [...el.querySelectorAll('.bx-team')].map((n) => n.textContent)

  it('shows no scores and no winner or loser styling', () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} hideScores />)
    expect(container.querySelectorAll('.bx-match').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.bx-score')).toHaveLength(0)
    expect(container.querySelectorAll('.bx-won, .bx-lost, .bx-match-done')).toHaveLength(0)
  })

  it('names no champion', () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} hideScores />)
    expect(screen.queryByText(/win the Super Bowl/i)).not.toBeInTheDocument()
    expect(container.querySelector('.bx-sb-champ')).toBeNull()
  })

  it('leaves every slot a team won its way into as TBD', () => {
    const { container } = render(<Bracket games={GAMES_2025} tz={TZ} hideScores />)
    const sb = container.querySelector('.bx-sb')
    expect(teamsIn(sb)).toEqual([])
    expect(within(sb).getAllByText('TBD')).toHaveLength(2)
    for (const conf of container.querySelectorAll('.bx-conf')) {
      const [wc, div, title] = conf.querySelectorAll('.bx-col')
      // The Wild Card round is the seeding: three matchups, six teams, plus the bye.
      expect(wc.querySelectorAll('.bx-match .bx-team')).toHaveLength(6)
      expect(wc.querySelectorAll('.bx-bye')).toHaveLength(1)
      // The Divisional round keeps only the No. 1 seed coming off its bye.
      expect(div.querySelectorAll('.bx-team')).toHaveLength(1)
      expect(div.querySelector('.bx-seed')).toHaveTextContent('1')
      expect(within(div).getAllByText('TBD')).toHaveLength(3)
      expect(teamsIn(title)).toEqual([])
    }
  })

  it('keeps a played game openable from the bracket', async () => {
    const onOpen = vi.fn()
    const { container } = render(
      <Bracket games={GAMES_2025} tz={TZ} onOpen={onOpen} hideScores />
    )
    const open = within(container.querySelector('.bx-sb')).getByText('Box score')
    await userEvent.click(open)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ round: 'SB' }))
  })

  it('drops a finished game status line but keeps an upcoming date and the LIVE badge', () => {
    const finalOT = GAMES_2025.map((g) =>
      g.round === 'SB' ? { ...g, statusLabel: 'Final/OT' } : g
    )
    render(<Bracket games={finalOT} tz={TZ} hideScores />)
    expect(screen.queryByText('Final/OT')).not.toBeInTheDocument()
    cleanup()

    const liveWC = {
      id: 'lw',
      tip: '2026-01-10T21:30:00.000Z',
      seasonType: 'postseason',
      round: 'WC',
      home: 'DAL',
      away: 'PHI',
      live: true,
      statusLabel: 'Q3 7:12',
      score: [14, 10],
    }
    const scheduledWC = {
      id: 'sw',
      tip: '2026-01-11T01:00:00.000Z',
      seasonType: 'postseason',
      round: 'WC',
      home: 'CHI',
      away: 'GB',
      statusLabel: 'Sun 4:30 PM',
    }
    const { container } = render(
      <Bracket games={[...REG, liveWC, scheduledWC]} tz={TZ} hideScores />
    )
    expect(screen.getByText(/LIVE/)).toBeInTheDocument()
    expect(screen.queryByText('Q3 7:12')).not.toBeInTheDocument()
    expect(screen.getByText('Sun 4:30 PM')).toBeInTheDocument()
    expect(container.querySelectorAll('.bx-score')).toHaveLength(0)
  })

  it('still shows the projected bracket before the postseason', () => {
    const { container } = render(<Bracket games={REG} tz={TZ} hideScores />)
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    // Three projected Wild Card matchups per conference, both teams named.
    const wc = container.querySelector('.bx-conf .bx-col')
    expect(wc.querySelectorAll('.bx-match .bx-team')).toHaveLength(6)
  })
})
