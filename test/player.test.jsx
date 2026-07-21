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
    experience: { years: 8 },
  },
}

// birthPlace only rides on the core athlete record, fetched separately.
const core = { birthPlace: { city: 'Whitehouse', state: 'TX', country: 'USA' } }

// Serve the site overview and the core record by URL. `opts` lets a test drop either
// side (a failed request → an ok:false response → null) or swap the core body.
const stub = ({ overviewOk = true, coreOk = true, coreBody = core } = {}) => {
  globalThis.fetch = vi.fn((url) => {
    const isCore = String(url).includes('sports.core.api')
    const ok = isCore ? coreOk : overviewOk
    const body = isCore ? coreBody : overview
    return Promise.resolve({ ok, json: async () => body })
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

  it('builds a country-only bio when the site overview is missing', async () => {
    // Overview 404s (→ null); the core record still supplies the birthplace.
    stub({ overviewOk: false })
    const { bio } = await fetchPlayer('3139477')
    expect(bio).toEqual({
      jersey: null,
      pos: null,
      height: null,
      weight: null,
      age: null,
      college: null,
      country: 'USA',
      team: null,
      experience: null,
    })
  })

  it('returns a null bio when neither record has anything', async () => {
    // Overview 404s and the core record carries no birthPlace.
    stub({ overviewOk: false, coreBody: {} })
    expect(await fetchPlayer('3139477')).toEqual({ bio: null })
  })

  it('keeps the site bio even when the birthplace is unknown', async () => {
    // Overview present, but the core record has no birthPlace — bio stands, no country.
    stub({ coreBody: {} })
    const { bio } = await fetchPlayer('3139477')
    expect(bio).toMatchObject({ college: 'Texas Tech', experience: 8, country: null })
  })

  it('folds in no country when the core record 404s', async () => {
    stub({ coreOk: false })
    const { bio } = await fetchPlayer('3139477')
    expect(bio).toMatchObject({ college: 'Texas Tech', country: null })
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
    // Jersey arrives with the bio and appends to the subtitle.
    expect(await screen.findByText(/#15/)).toBeInTheDocument()
    // Fetched bio fills in college + birthplace country with its flag. The bio line
    // is one joined string, so match a fragment of it.
    expect(screen.getByText(/Texas Tech/)).toBeInTheDocument()
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

  it('hides the bio line but still shows the country when only the birthplace is known', async () => {
    // Overview 404s, so the bio has no height/weight/age/college — just the country.
    stub({ overviewOk: false })
    render(<PlayerModal player={player} onClose={() => {}} />)
    expect(await screen.findByText('USA')).toBeInTheDocument()
    expect(document.querySelector('.pm-origin')).not.toBeNull()
    expect(document.querySelector('.pm-bio')).toBeNull()
  })

  it('shows the country name without a flag when the country is unmapped', async () => {
    stub({ coreBody: { birthPlace: { country: 'Narnia' } } })
    render(<PlayerModal player={player} onClose={() => {}} />)
    expect(await screen.findByText('Narnia')).toBeInTheDocument()
    expect(document.querySelector('img.pm-flag')).toBeNull()
  })

  it('falls back to initials when the headshot 404s', () => {
    stub()
    const { container } = render(<PlayerModal player={player} onClose={() => {}} />)
    fireEvent.error(container.querySelector('img.pm-shot'))
    expect(container.querySelector('.pm-initials')?.textContent).toBe('PM')
    expect(container.querySelector('img.pm-shot')).toBeNull()
  })

  it('copes with an unknown team, no position, and no bio at all', async () => {
    // fetchPlayer resolves to null (offline), so there is no bio: no jersey, no bio
    // line, no country. The team abbr is unknown, so it falls back to the raw abbr,
    // and the player carries no position or stats.
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')))
    const bare = { id: '9', name: 'Bare Guy', team: 'ZZZ' }
    render(<PlayerModal player={bare} onClose={() => {}} />)
    expect(await screen.findByText('No season stats yet.')).toBeInTheDocument()
    expect(screen.getByText('ZZZ')).toBeInTheDocument()
    expect(screen.queryByText(/#/)).not.toBeInTheDocument()
    expect(document.querySelector('.pm-bio')).toBeNull()
    expect(document.querySelector('.pm-origin')).toBeNull()
  })

  it('uses an empty initials string for a nameless player', () => {
    stub()
    const { container } = render(
      <PlayerModal player={{ id: '9', name: '', team: 'KC', pos: 'QB', passYds: 1 }} onClose={() => {}} />
    )
    fireEvent.error(container.querySelector('img.pm-shot'))
    expect(container.querySelector('.pm-initials')?.textContent).toBe('')
  })

  it('closes on a backdrop press but not on a press inside the dialog', async () => {
    stub()
    const onClose = vi.fn()
    render(<PlayerModal player={player} onClose={onClose} />)
    // A press on the dialog itself must not close it.
    fireEvent.mouseDown(document.querySelector('.player-modal'))
    expect(onClose).not.toHaveBeenCalled()
    // A press on the backdrop (target === currentTarget) closes it.
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores a response that lands after the modal has closed', async () => {
    // Hold both requests open, unmount (which aborts), then resolve: the late handler
    // must bail on the aborted signal rather than set state on an unmounted modal.
    const resolvers = []
    globalThis.fetch = vi.fn(() => new Promise((res) => resolvers.push(res)))
    const { unmount } = render(<PlayerModal player={player} onClose={() => {}} />)
    expect(resolvers.length).toBeGreaterThan(0)
    unmount()
    resolvers.forEach((r) => r({ ok: true, json: async () => core }))
    await new Promise((r) => setTimeout(r, 0))
    // No unhandled act() warning / state update means the aborted guard held.
    expect(document.querySelector('.player-modal')).toBeNull()
  })
})
