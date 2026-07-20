import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toasts from '../src/components/Toasts.jsx'

afterEach(cleanup)

// KC = Chiefs (home), DEN = Broncos (away).
const game = (o = {}) => ({ id: 'g1', home: 'KC', away: 'DEN', score: [24, 17], ...o })
const evt = (o) => ({ key: 'k1', game: game(), ...o })

describe('Toasts', () => {
  it('renders nothing when there are no events', () => {
    const { container } = render(<Toasts events={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces politely without stealing focus', () => {
    render(<Toasts events={[evt({ kind: 'kickoff' })]} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('phrases a kickoff', () => {
    render(<Toasts events={[evt({ kind: 'kickoff' })]} />)
    expect(screen.getByText('Kickoff')).toBeInTheDocument()
    expect(screen.getByText('Broncos at Chiefs')).toBeInTheDocument()
  })

  it('phrases a lead change with the new leader', () => {
    render(<Toasts events={[evt({ kind: 'lead-change', leader: 'KC', margin: 5 })]} />)
    expect(screen.getByText('Lead change')).toBeInTheDocument()
    expect(screen.getByText('Chiefs by 5')).toBeInTheDocument()
  })

  it('phrases a close game, including a tie', () => {
    const { rerender } = render(
      <Toasts events={[evt({ kind: 'nailbiter', leader: 'KC', margin: 3 })]} />
    )
    expect(screen.getByText('Chiefs by 3 in the fourth quarter')).toBeInTheDocument()

    rerender(<Toasts events={[evt({ kind: 'nailbiter', leader: 'tie', margin: 0 })]} />)
    expect(screen.getByText('Tied in the fourth quarter')).toBeInTheDocument()
  })

  it('phrases a final winner-first for a home and an away winner, and a tie', () => {
    // Home KC won 24–17.
    const { rerender } = render(<Toasts events={[evt({ kind: 'final', leader: 'KC' })]} />)
    expect(screen.getByText('Chiefs 24–17')).toBeInTheDocument()

    // Away DEN won 24–17 (score [home, away] = [17, 24]).
    rerender(
      <Toasts events={[evt({ kind: 'final', leader: 'DEN', game: { id: 'g1', home: 'KC', away: 'DEN', score: [17, 24] } })]} />
    )
    expect(screen.getByText('Broncos 24–17')).toBeInTheDocument()

    rerender(<Toasts events={[evt({ kind: 'final', leader: 'tie' })]} />)
    // Both the label and the body read "Final" on a tie.
    expect(screen.getAllByText('Final')).toHaveLength(2)
  })

  it('falls back to the abbreviation for an unknown team', () => {
    render(<Toasts events={[{ key: 'k1', kind: 'kickoff', game: { id: 'g1', home: 'ZZZ', away: 'YYY', score: [0, 0] } }]} />)
    expect(screen.getByText('YYY at ZZZ')).toBeInTheDocument()
  })

  it('renders an unknown kind inertly', () => {
    const { container } = render(<Toasts events={[evt({ kind: 'mystery' })]} />)
    expect(container.querySelector('.toast-mystery')).toBeTruthy()
    expect(container.querySelector('.toast-label').textContent).toBe('')
  })

  it('opens the game when the body is clicked', async () => {
    const onOpen = vi.fn()
    const g = game()
    render(<Toasts events={[{ key: 'k1', kind: 'final', leader: 'KC', game: g }]} onOpen={onOpen} />)
    await userEvent.click(screen.getByText('Chiefs 24–17'))
    expect(onOpen).toHaveBeenCalledWith(g)
  })

  it('dismisses by key', async () => {
    const onDismiss = vi.fn()
    render(<Toasts events={[evt({ kind: 'kickoff' })]} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledWith('k1')
  })

  it('stacks several moments at once', () => {
    render(
      <Toasts
        events={[
          evt({ kind: 'final', leader: 'KC', key: 'a' }),
          evt({ kind: 'kickoff', key: 'b' }),
        ]}
      />
    )
    expect(screen.getAllByLabelText('Dismiss')).toHaveLength(2)
  })
})
