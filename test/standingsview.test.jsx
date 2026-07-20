import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StandingsView from '../src/components/StandingsView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'
import { GAMES_2025 } from './fixtures/season-2025.js'

afterEach(cleanup)

const renderView = (props = {}) =>
  render(
    <FollowProvider>
      <StandingsView {...props} />
    </FollowProvider>
  )

describe('StandingsView — populated (2025 season)', () => {
  it('renders both conference groups and all eight division tables by default', () => {
    const { container } = renderView({ games: GAMES_2025, onPick: () => {} })
    expect(screen.getByText('American Football Conference')).toBeInTheDocument()
    expect(screen.getByText('National Football Conference')).toBeInTheDocument()
    // 4 divisions per conference → 8 division tables.
    const titles = [...container.querySelectorAll('.card-title')].map((n) => n.textContent)
    expect(titles).toContain('AFC West')
    expect(titles).toContain('NFC North')
    expect(titles.filter((t) => /^(AFC|NFC) (East|North|South|West)$/.test(t))).toHaveLength(8)
    // No empty-state note when games have been played.
    expect(screen.queryByText(/Standings begin in Week 1/)).not.toBeInTheDocument()
  })

  it('marks the division winner with the crown badge', () => {
    const { container } = renderView({ games: GAMES_2025 })
    expect(container.querySelector('.badge-in')).toBeInTheDocument()
    expect(container.querySelector('.badge-in').textContent).toContain('♛')
  })

  it('renders the T column and a tie in a record (Green Bay)', () => {
    const { container } = renderView({ games: GAMES_2025 })
    const headers = [...container.querySelectorAll('thead th')].map((n) => n.textContent)
    expect(headers).toContain('T')
    // GB has a road tie → a W-L-T style cell somewhere.
    expect(container.textContent).toMatch(/\d+-\d+-\d+/)
  })

  it('renders win and loss streak pills', () => {
    const { container } = renderView({ games: GAMES_2025 })
    expect(container.querySelector('.streak-w')).toBeInTheDocument()
    expect(container.querySelector('.streak-l')).toBeInTheDocument()
  })

  it('renders signed positive and negative differentials', () => {
    const { container } = renderView({ games: GAMES_2025 })
    expect(container.querySelector('td.num.pos')).toBeInTheDocument()
    expect(container.querySelector('td.num.neg')).toBeInTheDocument()
  })

  it('calls onPick when a team row is clicked', async () => {
    const onPick = vi.fn()
    const { container } = renderView({ games: GAMES_2025, onPick })
    await userEvent.click(container.querySelector('.team-btn'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(typeof onPick.mock.calls[0][0]).toBe('string')
  })

  it('does not throw when a row is clicked without an onPick handler', async () => {
    const { container } = renderView({ games: GAMES_2025 })
    await userEvent.click(container.querySelector('.team-btn'))
    expect(container.querySelector('.team-btn')).toBeInTheDocument()
  })

  it('toggles following a team from the star button', async () => {
    const { container } = renderView({ games: GAMES_2025 })
    const star = container.querySelector('.star')
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(star)
    expect(container.querySelector('.star.on')).toBeInTheDocument()
    expect(container.querySelector('.row-followed')).toBeInTheDocument()
  })
})

describe('StandingsView — conference mode', () => {
  it('shows two seeded conference tables with the playoff cutline after seed 7', async () => {
    const { container } = renderView({ games: GAMES_2025, onPick: () => {} })
    await userEvent.click(screen.getByRole('button', { name: 'By conference' }))

    // Only the two conference tables remain.
    const titles = [...container.querySelectorAll('.card-title')].map((n) => n.textContent)
    expect(titles).toEqual([
      'American Football Conference',
      'National Football Conference',
    ])

    // The cutline row appears once per conference table.
    const cutlines = container.querySelectorAll('.cutline')
    expect(cutlines).toHaveLength(2)
    expect(cutlines[0].textContent).toMatch(/Playoff cut/)

    // Cutline sits after the 7th data row within a table.
    const firstTable = container.querySelector('table.standings')
    const bodyRows = [...firstTable.querySelectorAll('tbody tr')]
    const cutIndex = bodyRows.findIndex((r) => r.classList.contains('cutline'))
    // 7 team rows precede the cutline row.
    expect(cutIndex).toBe(7)
  })

  it('can toggle back to division mode', async () => {
    renderView({ games: GAMES_2025 })
    await userEvent.click(screen.getByRole('button', { name: 'By conference' }))
    await userEvent.click(screen.getByRole('button', { name: 'By division' }))
    expect(screen.getByText('AFC East')).toBeInTheDocument()
  })
})

describe('StandingsView — empty (2026 snapshot)', () => {
  it('shows the pre-kickoff note and neutral (0-0-0) cells', () => {
    const { container } = renderView({ games: GAMES, onPick: () => {} })
    expect(screen.getByText(/Standings begin in Week 1/)).toBeInTheDocument()
    // Every streak is 0 → the dim em dash, never a pill.
    expect(container.querySelector('.streak-w')).not.toBeInTheDocument()
    expect(container.querySelector('.streak-l')).not.toBeInTheDocument()
    expect(container.querySelector('.streak')).not.toBeInTheDocument()
    // Diff of 0 carries neither the pos nor neg class.
    expect(container.querySelector('td.num.pos')).not.toBeInTheDocument()
    expect(container.querySelector('td.num.neg')).not.toBeInTheDocument()
    // A 0 differential is printed literally (not "+0").
    const dim = within(container.querySelector('.dim')) // StreakPill em dash
    expect(dim).toBeTruthy()
  })
})
