import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

// Default: no live data and no network. App polls the live overlay on mount, so without
// this every render test would hit ESPN and flake in CI. Tests that exercise the live
// overlay (espn/alerts/app) re-stub fetch in their own hooks, which run after this one.
beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) }))
})
