// Repo-level guards: invariants about the project itself rather than about the
// competition. Each of these has bitten a viewer in this family before, so the
// same file lives in every sibling repo.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
// Spelled as the LIVE paths on purpose: the frozen-data guard below proves these
// imports do not reach the live modules.
import { GAMES } from '../src/data/schedule.js'
import { PLAYERS } from '../src/data/leaders.js'
import { TEAMS } from '../src/data/teams.js'
import { GAMES as FROZEN_GAMES } from './fixtures/frozen/schedule.js'
import { PLAYERS as FROZEN_PLAYERS } from './fixtures/frozen/leaders.js'
import { TEAMS as FROZEN_TEAMS } from './fixtures/frozen/teams.js'
import { DATA_UPDATED_AT } from '../src/data/meta.js'
import { DATA_UPDATED_AT as FROZEN_DATA_UPDATED_AT } from './fixtures/frozen/meta.js'

const ROOT = join(import.meta.dirname, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

function walk(dir) {
  const out = []
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel))
    else out.push(rel)
  }
  return out
}

const scripts = walk('scripts').filter((f) => f.endsWith('.mjs'))

describe('scripts runtime', () => {
  it('has scripts to check', () => {
    expect(scripts.length).toBeGreaterThan(0)
  })

  // The data-regeneration scripts run in CI with no `npm install` of app deps.
  // An npm import would work locally and fail in the workflow.
  it('imports only Node built-ins and in-repo source', () => {
    for (const file of scripts) {
      const src = read(file)
      const imports = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
      for (const spec of imports) {
        const ok = spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../')
        expect(ok, `${file} imports "${spec}"`).toBe(true)
      }
    }
  })
})

describe('the ESPN host', () => {
  // site.api.espn.com serves the same routes but 403s from datacenter IPs AND
  // on a browser User-Agent, with no CORS headers. curl with its default UA
  // gets 200, so the host looks healthy from a terminal while every deployed
  // page silently loses live scores. site.web.api serves the same routes.
  it('is site.web.api everywhere it appears', () => {
    const files = [...scripts, 'src/services/espn.js'].filter((f) => existsSync(join(ROOT, f)))
    expect(files).toContain('src/services/espn.js')
    for (const file of files) {
      expect(read(file), file).not.toMatch(/site\.api\.espn\.com\/apis/)
    }
  })
})

describe('the new-season watch', () => {
  // The watch probes every day of a season, one scoreboard request each (about 150 a
  // run since ESPN dropped date-range queries), and a single 5xx that outlasts the
  // retries fails the whole run. fetchRetry's default of 5 tries is about 15 s of
  // backoff, and on September 26, 2026 one 502 burst on one day outlasted it in the
  // WNBA watch while the refresh two minutes later succeeded. The shape of the mistake:
  // a port or a cleanup drops the budget back to the default, and the daily watch
  // reddens on ESPN blips.
  it('gives each scoreboard day a longer retry budget than the refresh', () => {
    const src = read('scripts/check-new-season.mjs')
    const tries = src.match(/^const WATCH_TRIES = (\d+)$/m)
    expect(tries, 'no WATCH_TRIES constant').not.toBeNull()
    expect(Number(tries[1])).toBeGreaterThanOrEqual(8)
    expect(src).toMatch(/getJson\(`[^`]*scoreboard[^`]*`, WATCH_TRIES\)/)
  })
})

describe('the data-freshness monitor', () => {
  // The monitor finds the last successful fetch by listing recent Refresh runs, and
  // GitHub's listing is not always complete. On September 29, 2026 the NBA monitor
  // read a list that stopped eight days short, reported a 207 hour old fetch, went
  // red, and filed an issue, while Refresh was healthy and the same URL returned the
  // correct list under a minute later. A listing can only under-report, so the newest
  // heartbeat across several reads is the true one. The shape of the mistake: a
  // cleanup trims the monitor back to one read of one listing, and one bad answer
  // from GitHub reddens the run and files a false issue.
  const src = read('.github/workflows/data-freshness.yml')

  it('reads a stale-looking run history again before it goes red', () => {
    const tries = src.match(/^ {2}FRESH_READ_TRIES: (\d+)$/m)
    expect(tries, 'no FRESH_READ_TRIES setting').not.toBeNull()
    expect(Number(tries[1])).toBeGreaterThanOrEqual(3)
    expect(src).toMatch(/^ {2}FRESH_READ_WAIT: \d+$/m)
    expect(src).toContain('for attempt in $(seq 1 "$FRESH_READ_TRIES"); do')
    expect(src).toContain('sleep "$FRESH_READ_WAIT"')
  })

  it('judges the newest heartbeat seen in any read', () => {
    expect(src).toContain('[[ "$got" > "$fetch_at" ]]')
  })

  it('merges the workflow listing with the repo-wide listing', () => {
    expect(src).toContain('actions/workflows/$REFRESH_WORKFLOW/runs?per_page=15&status=completed')
    expect(src).toContain('actions/runs?per_page=100&status=completed')
    expect(src).toContain('endswith("/" + env.REFRESH_WORKFLOW)')
  })
  it('reports an unreadable run history as unknown, never as stale', () => {
    // On September 29, 2026 the stub run with every listing call failing went red AND
    // filed the stale-data issue, which claims Refresh stopped fetching. Nothing was
    // known. An unreadable history must exit before the issue is filed.
    expect(src).toContain('echo "unreadable"')
    const unknown = src.indexOf('freshness is unknown')
    expect(unknown).toBeGreaterThan(-1)
    expect(unknown).toBeLessThan(src.indexOf('gh issue create'))
  })

  it('never lets a failed issue call redden a fresh run', () => {
    // On October 3, 2026 the data was 0h old, the open-issue lookup got a GitHub 504,
    // and under `set -e` the bare `open=$(gh issue list ...)` ended the step red. The
    // shape of the mistake: an issue call run bare, where its exit status ends the step.
    expect(src).toContain('if open=$(gh issue list')
    expect(src).not.toMatch(/^ *open=\$\(gh issue list/m)
    expect(src).toContain('if gh issue close')
    expect(src).not.toMatch(/^ *gh issue close/m)
  })

  it('files no stale-data issue when the lookup failed', () => {
    // Filing without knowing whether one is open could duplicate it.
    const guard = src.indexOf('if [ "$looked_up" = 0 ]; then', src.indexOf('# Stale.'))
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(src.indexOf('gh issue create'))
  })
})

describe('the storage namespace', () => {
  // The hub and all the sibling viewers are served from one origin
  // (ismayc.github.io), so localStorage is shared. A key prefix borrowed from a
  // sibling silently reads and writes that app's preferences. Verified against
  // every repo's source on 2026-08-29.
  const FAMILY = [
    ['pl:', 'premier-league'],
    ['nba:', 'the-nba-schedule'],
    ['wnba:', 'the-wnba-schedule'],
    ['nfl:', 'the-nfl-schedule'],
    ['st:', 'hub'],
    ['mmm:', 'the-mens-march-madness'],
    ['mmw:', 'the-womens-march-madness'],
    ['wc2026:', 'world-cup-viewer'],
    ['wwc:', 'womens-world-cup-viewer'],
    ['euros:', 'football-euros-viewer'],
    ['copa:', 'copa-america-viewer'],
    ['fwwc:', 'fiba-womens-world-cup-viewer'],
    ['fmwc:', 'fiba-mens-world-cup-viewer'],
  ]
  const OWN = 'nfl:'
  const files = [...walk('src'), 'index.html'].filter(
    (f) => /\.(js|jsx|html)$/.test(f) && existsSync(join(ROOT, f)),
  )

  it('knows its own prefix is in the family registry', () => {
    expect(FAMILY.map(([p]) => p)).toContain(OWN)
  })

  it('uses this app’s prefix, never a sibling’s', () => {
    for (const file of files) {
      const src = read(file)
      const keys = [...src.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*'([^']+)'/g)].map(
        (m) => m[1],
      )
      for (const key of keys) {
        expect(key.startsWith(OWN), `${file} uses storage key "${key}"`).toBe(true)
      }
    }
  })

  it('never mentions a sibling’s prefix', () => {
    // The leading quote matters: it keeps 'nba:' from matching 'wnba:theme'.
    for (const file of files) {
      const src = read(file)
      for (const [foreign, repo] of FAMILY) {
        if (foreign === OWN) continue
        expect(src.includes(`'${foreign}`), `${file} mentions ${repo}'s "${foreign}"`).toBe(false)
      }
    }
  })
})

describe('generated data', () => {
  // A hand edit to a generated file is silently reverted by the next refresh
  // run, so the banner has to survive.
  it('carries the do-not-edit banner and names its builder', () => {
    for (const file of ['src/data/history.js', 'src/data/leaders.js', 'src/data/meta.js', 'src/data/schedule.js', 'src/data/teams.js']) {
      const src = read(file)
      expect(src, file).toMatch(/GENERATED by scripts\//)
      expect(src, file).toMatch(/do not edit by hand/)
    }
  })
})

describe('frozen data', () => {
  // The 100% gate must not move when a refresh rewrites src/data. On the WNBA sibling it
  // did three times in six weeks, and here the week-1 refresh went red on September 6,
  // 2026, each time because some test still reached a live module, directly or through
  // src/. The frozenData plugin in vite.config.js ends that by resolving every such
  // import to a stand-in. These keep it true.

  // Identity, not equality: the same array object means the import was redirected, not
  // that the live data happens to match today.
  it('is what an import of a live data module actually receives', () => {
    expect(GAMES).toBe(FROZEN_GAMES)
    expect(PLAYERS).toBe(FROZEN_PLAYERS)
    expect(TEAMS).toBe(FROZEN_TEAMS)
    // A string has no identity, so the frozen stamp is chosen to differ from the live
    // one: equal values here can only mean the import was redirected.
    expect(DATA_UPDATED_AT).toBe(FROZEN_DATA_UPDATED_AT)
    expect(read('src/data/meta.js')).not.toContain(FROZEN_DATA_UPDATED_AT)
  })

  // The shape of the mistake: the fetch script starts writing a fourth module and nobody
  // freezes it, so the suite quietly reads live data again.
  it('covers every module the refresh rewrites', () => {
    const written = [...read('scripts/fetch-schedule.mjs').matchAll(/['"](src\/data\/\w+\.js)['"]/g)]
      .map((m) => m[1])
    expect(written.length).toBeGreaterThan(0)
    const config = read('vite.config.js')
    for (const file of new Set(written)) {
      expect(config, `${file} has no frozen stand-in in vite.config.js`).toContain(`./${file}`)
      expect(existsSync(join(ROOT, file.replace('src/data', 'test/fixtures/frozen'))), file).toBe(true)
    }
  })

  it('keeps the live suite out of the main run, and the main suite out of the live run', () => {
    const config = read('vite.config.js')
    expect(config).toContain("LIVE ? 'test/live/**/*.test.{js,jsx}' : 'test/**/*.test.{js,jsx}'")
    expect(config).toContain("LIVE ? [] : ['test/live/**']")
    expect(JSON.parse(read('package.json')).scripts['test:data']).toBe('LIVE_DATA=1 vitest run')
  })

  // The refresh gate is the live suite. If it drifts back to the coverage gate, a
  // refresh can be blocked by something it did not change.
  it('is not what the refresh workflow gates on', () => {
    const gate = read('.github/workflows/refresh-data.yml').match(/id: gate[\s\S]*?\n\n/)[0]
    expect(gate).toContain('npm run test:data')
    expect(gate).not.toContain('coverage')
  })

  it('never imports a fixture into a live test', () => {
    for (const file of walk('test/live')) {
      if (file.endsWith('parity.test.js')) continue // compares the two on purpose
      expect(read(file), file).not.toMatch(/fixtures\//)
    }
  })
})

describe('the test timezone pin', () => {
  // Every date-derived assertion in this suite reads the pinned zone. A dropped pin
  // fails on a developer's machine in a confusing way and passes on CI, whose runners
  // sit in UTC.
  it('is set to UTC in vite.config.js', () => {
    expect(read('vite.config.js')).toContain("env: { TZ: 'UTC' }")
  })

  it('actually took effect in this process', () => {
    expect(process.env.TZ).toBe('UTC')
  })
})
