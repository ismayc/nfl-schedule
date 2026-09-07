import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEAGUE } from '../src/config/league.js'

// index.html, public/manifest.webmanifest and package.json state this app's identity in
// files no ES module can import, so src/config/league.js cannot be their source. The
// pre-paint theme script in particular MUST stay a blocking classic script: a
// `type="module"` script is deferred by spec, and the flash of the wrong palette it
// exists to prevent would come straight back.
//
// So the duplication stays, and this file makes it a CHECKED duplicate. The pattern has
// already caught two live mismatches in this family: premier-league shipped browser
// chrome of #12121a against a page painting #15171b, and the hub's manifest disagreed
// with its own meta tag. the-nfl-schedule still declares a themeColor nothing matches.
//
// The storage prefix has a second reason to be here. test/guards.test.js matches storage
// keys with a single-quoted-literal regex, so once the nine keys in this repo became
// template literals it could only see the one in index.html, and it checks that against
// the family registry. Tying the config to index.html closes the chain:
// registry <- index.html <- LEAGUE.storageKey.
const ROOT = join(import.meta.dirname, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

describe('the browser chrome agrees with src/config/league.js', () => {
  const html = read('index.html')

  it('titles the page with the app title and its tagline', () => {
    expect(html.match(/<title>([^<]+)<\/title>/)[1]).toBe(`${LEAGUE.title} — ${LEAGUE.tagline.toLowerCase()}`)
  })

  it('paints one background color across the page, the browser UI and the manifest', () => {
    // Dark is the family default, so the bare :root block carries the shipped color.
    const cssBg = read('src/index.css').match(/--bg:\s*(#[0-9a-f]{6})/i)[1].toLowerCase()
    const meta = html.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"/i)[1]
    const manifest = JSON.parse(read('public/manifest.webmanifest'))

    expect(cssBg).toBe(LEAGUE.themeColor.toLowerCase())
    expect(meta.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
    expect(manifest.theme_color.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
    expect(manifest.background_color.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
  })

  it('reads the theme from this app own storage prefix before paint', () => {
    expect(html.match(/localStorage\.getItem\('([^']+)'\)/)[1]).toBe(`${LEAGUE.storageKey}:theme`)
  })

  it('builds the .ics identity from the deploy slug', () => {
    // This is a recurring league rather than a one-off edition, so the .ics domain is the
    // slug itself and carries no year: next season's fixtures SHOULD update a
    // subscriber's existing entries rather than sit beside them.
    const slug = JSON.parse(read('package.json')).name
    expect(LEAGUE.ics.domain).toBe(slug)
    expect(LEAGUE.ics.prodId).toBe(`-//${slug}//EN`)
  })

  it('names the manifest with the title, not the whole page title', () => {
    expect(JSON.parse(read('public/manifest.webmanifest')).name).toBe(LEAGUE.title)
  })
})
