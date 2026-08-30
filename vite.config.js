import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the same dist/ works at a domain root (Netlify,
  // the-nfl-schedule.netlify.app) and under a subpath (GitHub Pages,
  // ismayc.github.io/nfl-schedule/).
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // Coverage runs single-threaded (--no-file-parallelism, see package.json) to dodge a
    // v8 parallel-temp race; that plus userEvent makes the App interaction tests slow on
    // CI's shared runners, so the 5s default test timeout is too tight there.
    testTimeout: 30000,
    hookTimeout: 30000,
    // Pin the suite's timezone so any test asserting a day heading, or what counts
    // as "today", is runner-independent. UTC is what these tests were already
    // written against: CI's runners sit in UTC, so this changes nothing there. What
    // it fixes is the LOCAL run, which until now needed an explicit `TZ=UTC` prefix
    // and failed in a confusing way without one. test/guards.test.js asserts the pin
    // so it cannot be dropped unnoticed on an already-UTC runner.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      // netlify/functions is inside the gate as well as src. The subscription
      // endpoint is real shipped code that a subscriber's calendar hits directly,
      // and it sat outside coverage.include with no tests at all while the badge
      // read 100%. See sports-viewer-meta/docs/LINEAGES.md section 5.
      include: ['src/**/*.{js,jsx}', 'netlify/functions/**/*.mjs'],
      exclude: ['src/main.jsx', 'src/data/**'],
      // Measure every included file, not only imported ones, so an untested module
      // counts as a gap. Thresholds enforce the family's 100% bar (PLAYBOOK §8).
      all: true,
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
