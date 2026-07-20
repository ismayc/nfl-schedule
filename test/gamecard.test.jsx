import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameCard from '../src/components/GameCard.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

afterEach(cleanup)

const TZ = 'America/New_York'
const base = {
  id: '1',
  tip: new Date(Date.now() + 3600e3).toISOString(),
  seasonType: 'regular',
  week: 1,
  home: 'KC',
  away: 'DEN',
}
const g = (o = {}) => ({ ...base, ...o })

describe('GameCard', () => {
  it('renders an upcoming game with kickoff time, week tag, and countdown', () => {
    const { container } = render(<GameCard game={g()} tz={TZ} />)
    expect(container.querySelector('.time')).toBeTruthy()
    expect(container.querySelector('.zone')).toBeTruthy()
    expect(container.querySelector('.wk-tag').textContent).toBe('Wk 1')
    expect(container.querySelector('.countdown').textContent).toMatch(/^in /)
  })

  it('omits the week tag when the game carries no week', () => {
    const { container } = render(<GameCard game={g({ week: null })} tz={TZ} />)
    expect(container.querySelector('.wk-tag')).toBeNull()
  })

  it('labels every live period', () => {
    const cases = [
      [{ live: true, period: 3, statusLabel: '3rd 8:24' }, 'Q3'],
      [{ live: true, period: 2, statusLabel: 'Halftime' }, 'HALF'],
      [{ live: true, statusLabel: 'End of 1st' }, 'END OF 1ST'],
      [{ live: true, statusLabel: 'Delayed' }, 'DELAYED'],
      [{ live: true }, 'LIVE'],
      [{ live: true, period: 5 }, 'OT'],
      [{ live: true, period: 6 }, 'OT2'],
    ]
    for (const [props, label] of cases) {
      const { container, unmount } = render(<GameCard game={g(props)} tz={TZ} />)
      expect(container.querySelector('.live-badge').textContent.trim()).toBe(`● ${label}`)
      unmount()
    }
  })

  it('shows a postponed and a canceled badge', () => {
    const { container, unmount } = render(<GameCard game={g({ postponed: true })} tz={TZ} />)
    expect(container.querySelector('.void-badge').textContent).toBe('Postponed')
    unmount()
    const { container: c2 } = render(<GameCard game={g({ canceled: true })} tz={TZ} />)
    expect(c2.querySelector('.void-badge').textContent).toBe('Canceled')
  })

  it('renders a final with score, winner highlight, and OT badges', () => {
    // Home KC 24, away DEN 17 → home wins.
    const { container, unmount } = render(<GameCard game={g({ score: [24, 17] })} tz={TZ} />)
    expect(container.querySelector('.final-badge').textContent).toBe('Final')
    expect(container.querySelectorAll('.side-score')).toHaveLength(2)
    const winners = container.querySelectorAll('.side.winner')
    expect(winners).toHaveLength(1)
    unmount()

    const { container: c1 } = render(<GameCard game={g({ score: [24, 17], ot: 1 })} tz={TZ} />)
    expect(c1.querySelector('.final-badge').textContent).toBe('Final/OT')

    const { container: c2 } = render(<GameCard game={g({ score: [24, 17], ot: 2 })} tz={TZ} />)
    expect(c2.querySelector('.final-badge').textContent).toBe('Final/2OT')

    // Away winner: away DEN 24 > home KC 17.
    const { container: c3 } = render(<GameCard game={g({ score: [17, 24] })} tz={TZ} />)
    expect(c3.querySelector('.side.winner')).toBeTruthy()
  })

  it('marks no winner on a tie yet still shows both scores', () => {
    const { container } = render(<GameCard game={g({ score: [20, 20] })} tz={TZ} />)
    expect(container.querySelectorAll('.side.winner')).toHaveLength(0)
    expect(container.querySelectorAll('.side-score')).toHaveLength(2)
  })

  it('hides scores in spoiler-free mode', () => {
    const { container } = render(<GameCard game={g({ score: [24, 17] })} tz={TZ} hideScores />)
    expect(container.querySelectorAll('.side-score')).toHaveLength(0)
  })

  it('shows venue-with-city, note, and truncated broadcast meta', () => {
    const { container } = render(
      <GameCard
        game={g({ venue: 'Arrowhead', city: 'Kansas City', note: 'Rivalry', broadcast: ['NBC', 'ESPN', 'ABC', 'Peacock'] })}
        tz={TZ}
      />
    )
    const metas = [...container.querySelectorAll('.game-meta span')].map((s) => s.textContent)
    expect(metas).toContain('Arrowhead, Kansas City')
    expect(metas).toContain('NBC · ESPN · ABC')
    expect(container.querySelector('.note').textContent).toBe('Rivalry')
  })

  it('shows a venue without a city', () => {
    const { container } = render(<GameCard game={g({ venue: 'Arrowhead' })} tz={TZ} />)
    const metas = [...container.querySelectorAll('.game-meta span')].map((s) => s.textContent)
    expect(metas).toContain('Arrowhead')
  })

  it('opens on click, Enter, and Space but ignores other keys', async () => {
    const onOpen = vi.fn()
    const { container } = render(<GameCard game={g()} tz={TZ} onOpen={onOpen} />)
    const card = container.querySelector('.game')
    await userEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.keyDown(card, { key: 'a' })
    expect(onOpen).toHaveBeenCalledTimes(3)
  })

  it('does not throw when opened without an onOpen handler', () => {
    const { container } = render(<GameCard game={g()} tz={TZ} />)
    const card = container.querySelector('.game')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
  })

  it('follows a team via the star without opening the game', async () => {
    const onOpen = vi.fn()
    render(
      <FollowProvider>
        <GameCard game={g()} tz={TZ} onOpen={onOpen} />
      </FollowProvider>
    )
    const star = screen.getByRole('button', { name: 'Follow Denver Broncos' })
    expect(star.textContent).toBe('☆')
    await userEvent.click(star)
    expect(onOpen).not.toHaveBeenCalled()
    expect(star).toHaveAttribute('aria-pressed', 'true')
    expect(star.textContent).toBe('★')
    expect(screen.getByRole('button', { name: 'Unfollow Denver Broncos' })).toBeTruthy()
    // The star swallows keyboard events so following never bubbles to the card.
    fireEvent.keyDown(star, { key: 'Enter' })
  })

  it('falls back to the abbreviation for an unknown team', () => {
    render(<GameCard game={g({ home: 'ZZZ', away: 'YYY' })} tz={TZ} />)
    expect(screen.getByRole('button', { name: 'Follow ZZZ' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Follow YYY' })).toBeTruthy()
  })
})
