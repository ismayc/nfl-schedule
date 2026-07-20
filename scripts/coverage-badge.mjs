// Turn the Vitest coverage summary into a shields.io "endpoint" JSON, written to
// public/ so the build copies it to the deployed site root (dist/coverage.json).
// The README badge reads it via https://img.shields.io/endpoint?url=…/coverage.json
// — fully self-hosted, no third-party coverage service or token. Run after
// `vitest run --coverage` (see the `coverage:badge` npm script).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'))
const pct = Math.round(summary.total.statements.pct)
const color =
  pct >= 90
    ? 'brightgreen'
    : pct >= 80
      ? 'green'
      : pct >= 70
        ? 'yellowgreen'
        : pct >= 60
          ? 'yellow'
          : pct >= 50
            ? 'orange'
            : 'red'

mkdirSync('public', { recursive: true })
writeFileSync(
  'public/coverage.json',
  JSON.stringify({ schemaVersion: 1, label: 'coverage', message: `${pct}%`, color })
)
console.log(`coverage badge: ${pct}% (${color})`)
