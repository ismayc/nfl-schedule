import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameDetail from '../src/components/GameDetail.jsx'
import { GAMES_2025 } from './fixtures/season-2025.js'

const TZ = 'America/New_York'

afterEach(cleanup)

const open = (game, props = {}) =>
  render(<GameDetail game={game} games={GAMES_2025} tz={TZ} onClose={() => {}} {...props} />)

// A regulation game with a full quarter line and three game leaders. game.line/game.stars
// are absent in both committed datasets, so this is the only way to reach those blocks.
const regGame = {
  id: 'reg',
  tip: '2030-01-01T18:00:00.000Z',
  seasonType: 'regular',
  week: 7,
  home: 'KC',
  away: 'DEN',
  score: [24, 17],
  line: { home: [7, 3, 7, 7], away: [0, 10, 0, 7] },
  stars: [
    { cat: 'passingYards', v: '312 YDS', who: 'P. Mahomes', team: 'KC' },
    { cat: 'rushingYards', v: '88 YDS', who: 'RB', team: 'DEN' },
    { cat: 'receivingYards', v: '120 YDS', who: 'WR', team: 'KC' },
  ],
  broadcast: ['NBC'],
}

describe('GameDetail — empty state', () => {
  it('renders nothing without a game', () => {
    const { container } = render(<GameDetail game={null} games={GAMES_2025} tz={TZ} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('GameDetail — header', () => {
  it('shows the final score and a Week label for a regular-season game', () => {
    const { container } = open(regGame)
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
    expect(container.querySelector('.md-score').textContent).toBe('17 – 24')
    expect(screen.getByText('Final')).toBeInTheDocument()
    expect(screen.getByText('Week 7')).toBeInTheDocument()
    expect(screen.getByText('Kansas City Chiefs')).toBeInTheDocument()
    expect(screen.getByText('Denver Broncos')).toBeInTheDocument()
  })

  it('shows a live status label for a live game', () => {
    open({ ...regGame, live: true, statusLabel: 'Q3 4:21' })
    expect(screen.getByText('Q3 4:21')).toBeInTheDocument()
  })

  it('falls back to "Live" when a live game has no status label', () => {
    open({ ...regGame, live: true, statusLabel: undefined })
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('marks a single overtime as Final/OT', () => {
    open({ ...regGame, ot: 1 })
    expect(screen.getByText('Final/OT')).toBeInTheDocument()
  })

  it('numbers a double overtime as Final/2OT', () => {
    open({ ...regGame, ot: 2 })
    expect(screen.getByText('Final/2OT')).toBeInTheDocument()
  })

  it('shows tip time and a countdown for an upcoming game', () => {
    const { container } = open({ id: 'up', tip: '2030-01-01T18:00:00.000Z', seasonType: 'regular', week: 3, home: 'KC', away: 'DEN' })
    expect(container.querySelector('.md-time')).toBeInTheDocument()
    expect(screen.getByText(/^in /)).toBeInTheDocument()
    expect(screen.queryByText('Final')).not.toBeInTheDocument()
  })

  it('omits the countdown once tip time has passed', () => {
    open({ id: 'past', tip: '2020-01-01T18:00:00.000Z', seasonType: 'regular', week: 1, home: 'KC', away: 'DEN' })
    expect(screen.queryByText(/^in /)).not.toBeInTheDocument()
  })
})

describe('GameDetail — spoiler reveal', () => {
  // Two meetings so the season series renders (a drill-score list to unmask), and a
  // line score on the opened game so its reveal is observable too.
  const tieGames = [
    {
      id: 't1',
      tip: '2025-09-10T00:00:00.000Z',
      seasonType: 'regular',
      week: 1,
      home: 'KC',
      away: 'DEN',
      score: [20, 20],
      line: { home: [7, 7, 3, 3], away: [7, 0, 10, 3] },
    },
    { id: 't2', tip: '2025-11-10T00:00:00.000Z', seasonType: 'regular', week: 9, home: 'DEN', away: 'KC', score: [10, 17] },
  ]

  it('reveals just this game’s score on demand in spoiler-free mode', async () => {
    const { container } = render(
      <GameDetail game={tieGames[0]} games={tieGames} tz={TZ} hideScores onClose={() => {}} />
    )
    expect(container.querySelector('.md-score')).toBeNull()
    expect(container.querySelector('.linescore')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Reveal score' }))
    // The score now shows and the button flips to hide.
    expect(container.querySelector('.md-score').textContent).toBe(
      `${tieGames[0].score[1]} – ${tieGames[0].score[0]}`
    )
    // The rest of the game is unmasked too — line score and the season-series scores.
    expect(container.querySelector('.linescore')).not.toBeNull()
    expect([...container.querySelectorAll('.drill-score')].some((el) => el.textContent !== '—')).toBe(true)

    // And it re-masks on demand.
    await userEvent.click(screen.getByRole('button', { name: 'Hide score' }))
    expect(container.querySelector('.md-score')).toBeNull()
  })

  it('offers no reveal when spoiler-free is off', () => {
    open(regGame)
    expect(screen.queryByRole('button', { name: /reveal score|hide score/i })).toBeNull()
  })

  it('offers no reveal for an upcoming game even in spoiler-free mode', () => {
    open(
      { id: 'up', tip: '2030-01-01T18:00:00.000Z', seasonType: 'regular', week: 3, home: 'KC', away: 'DEN' },
      { hideScores: true }
    )
    expect(screen.queryByRole('button', { name: /reveal score|hide score/i })).toBeNull()
  })
})

describe('GameDetail — line score', () => {
  it('renders four quarters plus a total, bolding the higher scorer', () => {
    const { container } = open(regGame)
    const heads = [...container.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads).toEqual(['', 'Q1', 'Q2', 'Q3', 'Q4', 'T'])
    // Q2: away 10 beats home 3.
    const awayRow = container.querySelectorAll('.linescore tbody tr')[0]
    expect(awayRow.querySelectorAll('td')[1]).toHaveClass('q-won')
  })

  it('labels a lone overtime "OT" and dashes a missing period cell', () => {
    const { container } = open({
      ...regGame,
      score: [17, 14],
      line: { home: [7, 0, 7, 0, 3], away: [0, 7, 0, 7] },
    })
    const heads = [...container.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads.slice(-2)).toEqual(['OT', 'T'])
    // The away row has no 5th-period cell, so it renders a dash.
    const awayRow = container.querySelectorAll('.linescore tbody tr')[0]
    expect(awayRow.querySelectorAll('td')[4].textContent).toBe('–')
  })

  it('numbers overtime periods when there is more than one', () => {
    const { container } = open({
      ...regGame,
      line: { home: [7, 0, 7, 0, 3, 3], away: [0, 7, 0, 7, 3, 0] },
    })
    const heads = [...container.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads.slice(-3)).toEqual(['OT1', 'OT2', 'T'])
  })

  it('renders no table for an empty line', () => {
    const { container } = open({ ...regGame, line: { home: [], away: [] } })
    expect(container.querySelector('.linescore')).toBeNull()
  })

  it('is hidden in spoiler-free mode', () => {
    const { container } = open(regGame, { hideScores: true })
    expect(container.querySelector('.linescore')).toBeNull()
    expect(container.querySelector('.md-score')).toBeNull()
    expect(container.querySelector('.md-time')).toBeInTheDocument()
  })
})

describe('GameDetail — game leaders', () => {
  it('labels the three yardage categories for both teams', () => {
    const { container } = open(regGame)
    const cats = [...container.querySelectorAll('.gl-cat')].map((n) => n.textContent)
    expect(cats).toEqual(expect.arrayContaining(['PASS', 'RUSH', 'REC']))
  })

  it('falls back to the raw category name for an unknown stat', () => {
    open({ ...regGame, stars: [{ cat: 'sacks', v: '3', who: 'D. Player', team: 'KC' }] })
    expect(screen.getByText('sacks')).toBeInTheDocument()
  })

  it('renders nothing when no leader belongs to either team', () => {
    const { container } = open({
      ...regGame,
      stars: [{ cat: 'passingYards', v: '1', who: 'x', team: 'ZZZ' }],
    })
    expect(container.querySelector('.leaders-split')).toBeNull()
  })

  it('renders nothing when there are no leaders at all', () => {
    const { container } = open({ ...regGame, stars: [] })
    expect(container.querySelector('.leaders-split')).toBeNull()
  })
})

describe('GameDetail — facts', () => {
  it('shows a postseason round name, venue, broadcast and note', () => {
    open({
      id: 'post',
      tip: '2026-01-17T21:30:00.000Z',
      seasonType: 'postseason',
      round: 'DIV',
      home: 'DEN',
      away: 'BUF',
      score: [33, 30],
      ot: 1,
      note: 'AFC Divisional Playoffs',
      venue: 'Empower Field',
      city: 'Denver',
      state: 'CO',
      broadcast: ['CBS'],
    })
    expect(screen.getByText('Round')).toBeInTheDocument()
    expect(screen.getByText('Divisional Round')).toBeInTheDocument()
    expect(screen.getByText(/Empower Field, Denver, CO/)).toBeInTheDocument()
    expect(screen.getByText('CBS')).toBeInTheDocument()
    expect(screen.getByText('AFC Divisional Playoffs')).toBeInTheDocument()
  })

  it('labels an unknown postseason round generically', () => {
    open({
      id: 'post2',
      tip: '2026-01-17T21:30:00.000Z',
      seasonType: 'postseason',
      round: 'ZZZ',
      home: 'KC',
      away: 'DEN',
      score: [10, 7],
    })
    expect(screen.getByText('Postseason')).toBeInTheDocument()
    // No venue/broadcast/note on this game.
    expect(screen.queryByText('Venue')).not.toBeInTheDocument()
    expect(screen.queryByText('Watch')).not.toBeInTheDocument()
    expect(screen.queryByText('Note')).not.toBeInTheDocument()
  })

  it('omits city/state when the venue carries none', () => {
    open({ ...regGame, venue: 'Some Stadium' })
    expect(screen.getByText('Some Stadium')).toBeInTheDocument()
  })
})

describe('GameDetail — tale of the tape', () => {
  it('marks the stronger side for a real matchup', () => {
    const { container } = open(regGame)
    expect(container.querySelectorAll('.tale-val.better').length).toBeGreaterThan(0)
  })

  it('marks a second matchup (covers both left- and right-better paths)', () => {
    const seaSf = GAMES_2025.find((g) => g.seasonType === 'regular' && [g.home, g.away].sort().join('') === 'SEASF')
    const { container } = open(seaSf)
    expect(container.querySelectorAll('.tale-val').length).toBeGreaterThan(0)
  })

  it('marks no side when the records are identical (empty season)', () => {
    const { container } = render(
      <GameDetail game={regGame} games={[]} tz={TZ} onClose={() => {}} />
    )
    expect(container.querySelectorAll('.tale-val.better')).toHaveLength(0)
  })
})

describe('GameDetail — season series', () => {
  const tieGames = [
    { id: 't1', tip: '2025-09-10T00:00:00.000Z', seasonType: 'regular', week: 1, home: 'KC', away: 'DEN', score: [20, 20] },
    { id: 't2', tip: '2025-11-10T00:00:00.000Z', seasonType: 'regular', week: 9, home: 'DEN', away: 'KC', score: [10, 17] },
    { id: 't3', tip: '2025-12-10T00:00:00.000Z', seasonType: 'regular', week: 13, home: 'KC', away: 'DEN', score: [30, 10] },
  ]

  it('lists meetings with a wins–wins–ties tally, ties included', () => {
    render(<GameDetail game={tieGames[0]} games={tieGames} tz={TZ} onClose={() => {}} />)
    // DEN 0, KC 2, ties 1 → header reads from away(DEN)–home(KC): 0–2–1
    expect(screen.getByText(/Season series — 0–2–1/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('masks the series scores in spoiler-free mode', () => {
    const { container } = render(
      <GameDetail game={tieGames[0]} games={tieGames} tz={TZ} hideScores onClose={() => {}} />
    )
    for (const el of container.querySelectorAll('.drill-score')) {
      expect(el.textContent).toBe('—')
    }
  })

  it('shows no series section when the teams have not met', () => {
    render(<GameDetail game={regGame} games={[]} tz={TZ} onClose={() => {}} />)
    expect(screen.queryByText(/Season series/)).not.toBeInTheDocument()
  })
})

describe('GameDetail — closing and navigation', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn()
    open(regGame, { onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes from the ✕ button', async () => {
    const onClose = vi.fn()
    open(regGame, { onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a backdrop press but not a panel press', () => {
    const onClose = vi.fn()
    const { container } = open(regGame, { onClose })
    fireEvent.mouseDown(container.querySelector('.modal'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })

  it('jumps to a team schedule and closes', async () => {
    const onPickTeam = vi.fn()
    const onClose = vi.fn()
    open(regGame, { onPickTeam, onClose })
    const chips = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(chips[0])
    expect(onPickTeam).toHaveBeenCalledWith('DEN')
    expect(onClose).toHaveBeenCalled()
  })

  it('jumps to the home team schedule too', async () => {
    const onPickTeam = vi.fn()
    open(regGame, { onPickTeam })
    const chips = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(chips[1])
    expect(onPickTeam).toHaveBeenCalledWith('KC')
  })

  it('still closes when no onPickTeam handler is supplied', async () => {
    const onClose = vi.fn()
    open(regGame, { onClose, onPickTeam: undefined })
    const chips = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(chips[1])
    expect(onClose).toHaveBeenCalled()
  })
})
