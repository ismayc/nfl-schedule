import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import GameCard from '../src/components/GameCard.jsx'
import GameDetail from '../src/components/GameDetail.jsx'

// ESPN lists no channel until a few days before a game. Only an upcoming game may say so:
// the tag on a finished game would read as a channel that is still to come.
beforeEach(() => localStorage.clear())
afterEach(cleanup)

const TZ = 'America/New_York'
const HOUR = 3600e3
const game = (o = {}) => ({
  id: '1',
  tip: new Date(Date.now() + 48 * HOUR).toISOString(),
  seasonType: 'regular',
  home: 'KC',
  away: 'DEN',
  ...o,
})
const past = { tip: new Date(Date.now() - 48 * HOUR).toISOString() }

describe('Channel TBA', () => {
  it('tags an upcoming game with no channel, on the card and in the detail', () => {
    render(<GameCard game={game()} tz={TZ} />)
    expect(screen.getByText('Channel TBA')).toHaveClass('net-tba')
    cleanup()
    render(<GameDetail game={game()} games={[game()]} tz={TZ} onClose={() => {}} />)
    expect(screen.getByText('Channel TBA')).toBeInTheDocument()
  })

  it('drops the tag once a channel is listed', () => {
    const g = game({ broadcast: ['ESPN'] })
    render(<GameCard game={g} tz={TZ} />)
    expect(screen.queryByText('Channel TBA')).toBeNull()
    cleanup()
    render(<GameDetail game={g} games={[g]} tz={TZ} onClose={() => {}} />)
    expect(screen.queryByText('Channel TBA')).toBeNull()
  })

  it('never tags a game that is over or an empty list on a finished game', () => {
    const g = game({ ...past, score: [100, 90], broadcast: [] })
    render(<GameCard game={g} tz={TZ} />)
    expect(screen.queryByText('Channel TBA')).toBeNull()
    cleanup()
    render(<GameDetail game={g} games={[g]} tz={TZ} onClose={() => {}} />)
    expect(screen.queryByText('Channel TBA')).toBeNull()
  })

  it('treats an empty channel list like a missing one', () => {
    render(<GameCard game={game({ broadcast: [] })} tz={TZ} />)
    expect(screen.getByText('Channel TBA')).toBeInTheDocument()
  })
})
