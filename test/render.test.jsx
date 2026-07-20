import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { VIEWS } from '../src/utils/urlState.js'

// Smoke test: the committed 2026 snapshot has NO played games, empty standings, and no
// leaders. Every view must render without crashing on that empty state — build success
// alone doesn't prove it (PLAYBOOK §6: verify the effect, not the report).
afterEach(cleanup)
// Each App syncs its view into the URL; reset it so one test's view doesn't leak into
// the next via readState() on mount.
beforeEach(() => window.history.replaceState(null, '', '/'))

const renderApp = () =>
  render(
    <FollowProvider>
      <App />
    </FollowProvider>
  )

describe('App renders every view on the empty 2026 snapshot', () => {
  it('mounts with the schedule and the season title', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: /NFL Schedule/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('switches through all nav views without throwing', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: /views/i })
    for (const v of VIEWS) {
      const label = v.label.replace(/^[^\w]+\s*/, '') // strip leading emoji
      const btn = within(nav).getByRole('button', { name: new RegExp(label, 'i') })
      fireEvent.click(btn)
      // The view region still exists and the app didn't blow up.
      expect(screen.getByRole('main')).toBeInTheDocument()
    }
  })

  it('offers all 32 teams in the filter (plus "All teams")', () => {
    renderApp()
    expect(screen.getByRole('main')).toBeInTheDocument()
    // The team <select> is the combobox carrying 33 options (32 teams + "All teams").
    const combos = screen.getAllByRole('combobox')
    const teamSelect = combos.find((c) => c.querySelectorAll('option').length === 33)
    expect(teamSelect).toBeTruthy()
    expect(within(teamSelect).getByText('Kansas City Chiefs')).toBeInTheDocument()
  })
})
