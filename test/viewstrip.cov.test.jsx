import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

// jsdom has no IntersectionObserver (the App effect guards on that), so this stub is
// what turns the condensed-strip machinery ON for this file — and hands the observer
// callback to the tests so they can play the nav scrolling out of / back into view.
let ioCb
let ioInstance
class IOStub {
  constructor(cb) {
    ioCb = cb
    ioInstance = this
    this.observe = vi.fn()
    this.disconnect = vi.fn()
  }
}

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

const navAway = () => act(() => ioCb([{ isIntersecting: false }]))
const navBack = () => act(() => ioCb([{ isIntersecting: true }]))
const strip = () => document.querySelector('.view-strip')

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('IntersectionObserver', IOStub)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('condensed view strip', () => {
  it('watches the in-flow nav and appears only once it scrolls away', async () => {
    const { unmount } = await mount()
    expect(ioInstance.observe).toHaveBeenCalledWith(
      screen.getByRole('navigation', { name: 'Views' })
    )
    expect(strip()).toBeNull()

    navAway()
    expect(strip()).not.toBeNull()
    // Collapsed strip: just the current-view toggle, no tab set yet.
    const toggle = within(strip()).getByRole('button', { name: /📋 Schedule/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Views quick switch' })).toBeNull()

    navBack()
    expect(strip()).toBeNull()

    unmount()
    expect(ioInstance.disconnect).toHaveBeenCalled()
  })

  it('expands to the full tab set and switches views from mid-page', async () => {
    await mount()
    navAway()

    const toggle = within(strip()).getByRole('button', { name: /📋 Schedule/ })
    await userEvent.click(toggle)
    const tabs = screen.getByRole('navigation', { name: 'Views quick switch' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(within(tabs).getByRole('button', { name: '📊 Standings' }))
    // Picking a view switches the app and re-collapses the tab set…
    expect(screen.queryByRole('navigation', { name: 'Views quick switch' })).toBeNull()
    // …and both the strip toggle and the real nav now reflect the new view.
    expect(within(strip()).getByRole('button', { name: /📊 Standings/ })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Views' })
    expect(within(nav).getByRole('button', { name: '📊 Standings' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('closes an open tab set when the real nav scrolls back into view', async () => {
    await mount()
    navAway()
    await userEvent.click(within(strip()).getByRole('button', { name: /📋 Schedule/ }))
    expect(screen.getByRole('navigation', { name: 'Views quick switch' })).toBeInTheDocument()

    navBack()
    expect(strip()).toBeNull()

    // Scrolling away again must start collapsed, not resurrect the old open state.
    navAway()
    expect(screen.queryByRole('navigation', { name: 'Views quick switch' })).toBeNull()
  })
})
