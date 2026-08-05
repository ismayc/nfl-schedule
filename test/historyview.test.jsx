import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryView from '../src/components/HistoryView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { HISTORY_BY_YEAR } from '../src/data/history.js'

const TZ = 'America/New_York'

afterEach(cleanup)

// The bracket inside a season renders team names, which read the follow context.
const mount = (props = {}) =>
  render(
    <FollowProvider>
      <HistoryView tz={TZ} {...props} />
    </FollowProvider>
  )

const mode = (name) => within(document.querySelector('.view-tools')).getByRole('button', { name })

describe('HistoryView — one season', () => {
  it('opens on the newest archived season', () => {
    const { container } = mount()
    expect(container.querySelector('.season-pick select')).toHaveValue('2025')
  })

  it('falls back to the newest season for a year it does not hold', () => {
    // 2019 predates the 17-game season, so it is not (and never will be) archived.
    const { container } = mount({ season: 2019 })
    expect(container.querySelector('.season-pick select')).toHaveValue('2025')
  })

  it('shows the chosen season and reports a change back to the app', async () => {
    const onSeason = vi.fn()
    const { container } = mount({ season: 2023, onSeason })
    expect(container.querySelector('.season-pick select')).toHaveValue('2023')

    await userEvent.selectOptions(container.querySelector('.season-pick select'), '2021')
    expect(onSeason).toHaveBeenCalledWith(2021)
  })

  it('renders that season’s champion, bracket and both final tables', () => {
    const { container } = mount({ season: 2023 })

    // 2023: Kansas City beat San Francisco 25–22 from the 3 seed.
    expect(screen.getByText(/win the Super Bowl/)).toHaveTextContent(
      /Kansas City Chiefs.*beating San Francisco 49ers 25–22/
    )
    expect(container.querySelector('.hy-note')).toHaveTextContent(
      /3rd seed beat the 1st — Chiefs over 49ers/
    )
    // The full bracket: 13 games, each with a box-score handle.
    expect(container.querySelectorAll('.bx-match-open')).toHaveLength(13)
    // Both conference tables, all 32 teams.
    expect(container.querySelectorAll('.standings tbody tr')).toHaveLength(32)
  })

  it('lists the real final table, with seeds and the playoff cut', () => {
    const { container } = mount({ season: 2023 })
    const afc = container.querySelectorAll('.standings')[0]
    const rows = within(afc).getAllByRole('row')
    // Baltimore were the 2023 AFC 1 seed at 13-4.
    expect(rows[1]).toHaveTextContent('Ravens')
    expect(rows[1]).toHaveTextContent('13')
    expect(rows[1]).toHaveTextContent('Division')
    // Seven teams make the field; the rest are dimmed out.
    expect(afc.querySelectorAll('tbody tr:not(.row-elim)')).toHaveLength(7)
  })

  it('routes a team click to the team panel and a playoff game to its box score', async () => {
    const onPick = vi.fn()
    const onOpen = vi.fn()
    const { container } = mount({ season: 2023, onPick, onOpen })

    await userEvent.click(container.querySelector('.standings .hy-team'))
    expect(onPick).toHaveBeenCalled()

    await userEvent.click(container.querySelector('.bx-match-open'))
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ round: 'WC', id: expect.any(String) })
    )
  })
})

// The live Stats view's cards, driven by an archived season. Every number is a real 2023
// figure, so a bad join or a wrong denominator fails rather than merely rendering.
describe('HistoryView — stats for one season', () => {
  const stats = async (season = 2023, props = {}) => {
    const utils = mount({ season, ...props })
    await userEvent.click(mode('Stats'))
    return utils
  }

  it('keeps the season picker, so stats follow the chosen year', async () => {
    const { container } = await stats(2022)
    expect(container.querySelector('.season-pick select')).toHaveValue('2022')
    // 2022 is the 271-game season — Buffalo–Cincinnati was never made up.
    expect(container.querySelector('.tile-value')).toHaveTextContent('271')
  })

  it('shows the season totals it can no longer derive from games', async () => {
    const { container } = await stats()
    const tiles = [...container.querySelectorAll('.tile')].map((t) => t.textContent)
    expect(tiles[0]).toMatch(/272Games played/)
    expect(tiles[3]).toMatch(/56%Home win rate151 of 272/)
    // A tie is the NFL's own quirk, and 2023 had none.
    expect(tiles[5]).toMatch(/0Ties/)
    expect(tiles[6]).toMatch(/One-score finisheswithin 8/)
  })

  it('drills into the closest and highest-scoring games, each opening its box score', async () => {
    const onOpen = vi.fn()
    const { container } = await stats(2023, { onOpen })

    await userEvent.click(container.querySelectorAll('.tile-btn')[0])
    const closest = [...container.querySelectorAll('.drill-note')].map((n) => n.textContent)
    expect(closest).toHaveLength(5)
    // Nothing in the closest list was decided by more than a field goal.
    for (const n of closest) expect(Number(n.replace('by ', ''))).toBeLessThanOrEqual(3)

    await userEvent.click(container.querySelector('button.drill-row'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }))

    // Re-clicking the open tile collapses it; the other tile opens its own list.
    await userEvent.click(container.querySelectorAll('.tile-btn')[0])
    expect(container.querySelector('.drill')).toBeNull()
    await userEvent.click(container.querySelectorAll('.tile-btn')[1])
    const totals = [...container.querySelectorAll('.drill-note')].map((n) =>
      Number(n.textContent.replace(' total', ''))
    )
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
  })

  it('renders a board for all eight categories, grouped by unit', async () => {
    const { container } = await stats()
    expect(container.querySelectorAll('.leaders')).toHaveLength(8)
    // 2023 passing yards: Tua Tagovailoa, 4,624.
    const first = container.querySelector('.leaders tr')
    expect(first).toHaveTextContent('Tua Tagovailoa')
    expect(first).toHaveTextContent('4624')
  })

  it('opens a leader’s pop-out with that season’s stat line, not this season’s', async () => {
    const onPickPlayer = vi.fn()
    const { container } = await stats(2023, { onPickPlayer })
    await userEvent.click(container.querySelector('.lead-player'))
    expect(onPickPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tua Tagovailoa', team: 'MIA', passYds: 4624 })
    )
  })

  it('ranks the scoring margin from points for and against', async () => {
    const { container } = await stats()
    const rows = container.querySelectorAll('.margin-row')
    expect(rows).toHaveLength(32)
    // 2023 Baltimore: best point differential in the league.
    expect(rows[0]).toHaveTextContent('Ravens')
    expect(rows[0]).toHaveTextContent('+11.9')
    expect(rows[31].querySelector('.margin-bar.neg')).toBeTruthy()
  })

  it('routes a margin-chart team click to the team panel', async () => {
    const onPick = vi.fn()
    const { container } = await stats(2023, { onPick })
    await userEvent.click(container.querySelector('.margin-team'))
    // The season travels with the team: the panel it opens has to describe THAT
    // season, not whichever one the live board happens to be on.
    expect(onPick).toHaveBeenCalledWith('BAL', 2023)
  })
})

describe('HistoryView — Super Bowls', () => {
  it('lists every Super Bowl with both seeds and the best record of that season', async () => {
    const { container } = mount()
    await userEvent.click(mode('Super Bowls'))

    const rows = [...container.querySelectorAll('.hy-table tbody tr')].map((r) =>
      [...r.cells].map((c) => c.textContent.trim())
    )
    expect(rows).toHaveLength(5)
    // 2021: the season both finalists were 4 seeds.
    expect(rows[4]).toEqual(['2021', 'Rams', '4', 'Bengals', '4', '23–20', 'Buccaneers 13-4'])
    // 2024: Detroit had the best record and didn't reach it.
    expect(rows[1]).toEqual(['2024', 'Eagles', '2', 'Chiefs', '1', '40–22', 'Lions 15-2'])
  })

  it('counts how many finalists came from outside the top seed', async () => {
    const { container } = mount()
    await userEvent.click(mode('Super Bowls'))
    // 10 finalists across five seasons; three were 1 seeds (2022 KC, 2022 PHI, 2023 SF,
    // 2024 KC, 2025 SEA), so the copy has to count rather than guess.
    expect(container.querySelector('.fine')).toHaveTextContent(/\d+ of 10 Super Bowl teams/)
  })

  it('jumps back to a season, and opens a champion’s team panel', async () => {
    const onSeason = vi.fn()
    const onPick = vi.fn()
    const { container } = mount({ onSeason, onPick })
    await userEvent.click(mode('Super Bowls'))

    await userEvent.click(container.querySelector('.hy-year'))
    expect(onSeason).toHaveBeenCalledWith(2025)

    await userEvent.click(container.querySelector('.hy-table .hy-team'))
    expect(onPick).toHaveBeenCalledWith(HISTORY_BY_YEAR[2025].champion, 2025)
  })
})

describe('HistoryView — mode switching', () => {
  it('marks the active mode, swaps the panel, and hides the picker on all-seasons modes', async () => {
    mount()
    expect(mode('By season')).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.season-pick')).toBeTruthy()

    await userEvent.click(mode('Super Bowls'))
    expect(mode('Super Bowls')).toHaveAttribute('aria-pressed', 'true')
    expect(mode('By season')).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.season-pick')).toBeNull()
  })
})
