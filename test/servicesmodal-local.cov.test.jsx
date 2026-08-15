import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

// This league's slate is entirely national today, so the real LOCAL_CATALOG is
// empty and the shelf never renders. A synthetic catalog exercises the shelf the
// way it will behave the moment ESPN names a market feed.
// Built inside the factory: vi.mock is hoisted above every top-level const.
vi.mock('../src/utils/watch.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    LOCAL_CATALOG: [
      { key: 'local:Team Sports Net', label: 'Team Sports Net', kind: 'local', team: 'AAA', match: (b) => b.includes('Team Sports Net') },
      { key: 'local:Shared Feed', label: 'Shared Feed', kind: 'local', team: null, match: (b) => b.includes('Shared Feed') },
    ],
  }
})

import ServicesModal from '../src/components/ServicesModal.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { LOCAL_CATALOG as LOCALS } from '../src/utils/watch.js'

const open = () =>
  render(
    <ServicesProvider>
      <ServicesModal onClose={() => {}} />
    </ServicesProvider>
  )

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('ServicesModal — local & regional channels', () => {
  it('starts collapsed, stays open once expanded, and saves a pick', () => {
    const { container } = open()
    const shelf = container.querySelector('details.svc-local')
    expect(shelf).not.toHaveAttribute('open')

    // Open the shelf the way a browser does: flip the DOM state, fire `toggle`.
    shelf.open = true
    fireEvent(shelf, new Event('toggle'))
    expect(shelf).toHaveAttribute('open')

    // Checking a channel re-renders the modal — the shelf must not snap shut.
    fireEvent.click(container.querySelector('.svc-local input[type="checkbox"]'))
    expect(shelf).toHaveAttribute('open')
    expect(JSON.parse(localStorage.getItem('nfl:services'))).toContain(LOCALS[0].key)
  })

  it('starts open (channel checked and highlighted) when a local pick is saved', () => {
    localStorage.setItem('nfl:services', JSON.stringify([LOCALS[0].key]))
    const { container } = open()
    expect(container.querySelector('details.svc-local')).toHaveAttribute('open')
    const box = container.querySelector('.svc-local input[type="checkbox"]')
    expect(box).toBeChecked()
    expect(box.closest('.svc-item')).toHaveClass('on')
  })

  it('tags each channel with its team, falling back to Local when unattributed', () => {
    const { container } = open()
    const items = [...container.querySelectorAll('.svc-local .svc-item')]
    expect(items.map((el) => el.querySelector('.svc-name').textContent)).toEqual([
      'Team Sports Net',
      'Shared Feed',
    ])
    expect(items.map((el) => el.querySelector('.svc-kind').textContent)).toEqual(['AAA', 'Local'])
  })
})
