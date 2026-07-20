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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/data/**'],
      // Measure every included file, not only imported ones, so an untested module
      // counts as a gap. Thresholds enforce the family's 100% bar (PLAYBOOK §8).
      all: true,
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
