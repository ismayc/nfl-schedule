import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import PlayerModal from '../src/components/PlayerModal.jsx'
import { fetchPlayer, headshotUrl } from '../src/services/player.js'
import { flagUrl } from '../src/utils/flag.js'

const overview = {
  athlete: {
    displayName: 'Patrick Mahomes',
    jersey: '15',
    position: { abbreviation: 'QB' },
    displayHeight: `6' 3"`,
    displayWeight: '225 lbs',
    age: 30,
    college: { name: 'Texas Tech' },
    team: { displayName: 'Kansas City Chiefs' },
  },
}

// birthPlace only rides on the core athlete record, fetched separately.
const core = { birthPlace: { city: 'Whitehouse', state: 'TX', country: 'USA' } }

const stub = () => {
  globalThis.fetch = vi.fn((url) => {
    const body = String(url).includes('sports.core.api') ? core : overview
    return Promise.resolve({ ok: true, json: async () => body })
  })
}

// A committed leaderboard/roster row — position-specific stats, the way leaderboard()
// and playersByTeam() hand it to the modal.
const player = {
  id: '3139477',
  name: 'Patrick Mahomes',
  short: 'P. Mahomes',
  team: 'KC',
  pos: 'QB',
  gp: 17,
  passYds: 4183,
  passTD: 27,
  passInt: 11,
  rating: 92.6,
  rushYds: 358,
  rushTD: 2,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('fetchPlayer (service)', () => {
  it('parses the bio, folding in the birthplace country from the core record', async () => {
    stub()
    const { bio } = await fetchPlayer('3139477')
    expect(bio).toMatchObject({
      jersey: '15',
      pos: 'QB',
      height: `6' 3"`,
      age: 30,
      college: 'Texas Tech',
      country: 'USA',
    })
  })

  it('returns null when the request throws', async () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error('offline')
    })
    expect(await fetchPlayer('x')).toBeNull()
  })

  it('builds a deterministic headshot URL', () => {
    expect(headshotUrl('3139477')).toContain('/headshots/nfl/players/full/3139477.png')
  })
})

describe('flagUrl', () => {
  it('maps a country name onto its ESPN IOC flag code', () => {
    expect(flagUrl('USA')).toContain('/countries/500/usa.png')
    expect(flagUrl('Germany')).toContain('/countries/500/ger.png')
  })

  it('returns null for a country it has no code for', () => {
    expect(flagUrl('Wakanda')).toBeNull()
    expect(flagUrl(null)).toBeNull()
  })
})

describe('PlayerModal (component)', () => {
  it('renders nothing without a player', () => {
    const { container } = render(<PlayerModal player={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the committed season tiles immediately, then the fetched bio and country', async () => {
    stub()
    render(<PlayerModal player={player} onClose={() => {}} />)
    // Committed and instant: the position-appropriate stat tiles.
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument()
    expect(screen.getByText('4183')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    // Rate stats keep a decimal.
    expect(screen.getByText('92.6')).toBeInTheDocument()
    // Fetched bio fills in college + birthplace country with its flag. The bio line
    // is one joined string, so match a fragment of it.
    expect(await screen.findByText(/Texas Tech/)).toBeInTheDocument()
    expect(screen.getByText('USA')).toBeInTheDocument()
    const flag = document.querySelector('img.pm-flag')
    expect(flag?.getAttribute('src')).toContain('/countries/500/usa.png')
    // A flag that 404s hides itself rather than showing a broken image.
    fireEvent.error(flag)
    expect(flag.style.display).toBe('none')
  })

  it('picks at most six tiles, chosen by the fields the player actually has', async () => {
    stub()
    render(<PlayerModal player={player} onClose={() => {}} />)
    expect(document.querySelectorAll('.pm-stat')).toHaveLength(6)
  })

  it('falls back to initials when the headshot 404s', () => {
    stub()
    const { container } = render(<PlayerModal player={player} onClose={() => {}} />)
    fireEvent.error(container.querySelector('img.pm-shot'))
    expect(container.querySelector('.pm-initials')?.textContent).toBe('PM')
    expect(container.querySelector('img.pm-shot')).toBeNull()
  })

  it('shows a plain note when the player has no season stats yet', () => {
    stub()
    render(<PlayerModal player={{ id: '1', name: 'Rookie Rook', team: 'KC', pos: 'WR' }} onClose={() => {}} />)
    expect(screen.getByText('No season stats yet.')).toBeInTheDocument()
    expect(document.querySelectorAll('.pm-stat')).toHaveLength(0)
  })
})
