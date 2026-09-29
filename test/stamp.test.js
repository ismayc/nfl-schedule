// The refresh's change detection (scripts/lib/stamp.mjs). The "data as of" stamp must move
// when, and only when, a generated file changes: a stamp that moved on every fetch would
// make each twice-daily refresh a commit and a deploy with no new data in it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDataWriter, metaModule, sameContent, writeIfChanged } from '../scripts/lib/stamp.mjs'

const OLD = '2026-09-01T00:00:00.000Z'
const NOW = new Date('2026-09-29T12:00:00.000Z')

let dir
let meta
const at = (f) => join(dir, f)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nfl-stamp-'))
  meta = at('meta.js')
  writeFileSync(meta, metaModule(OLD))
  writeFileSync(at('schedule.js'), 'export const GAMES = [1]\n')
  writeFileSync(at('atl.png'), Buffer.from([1, 2, 3]))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('sameContent', () => {
  it('compares bytes, for strings and buffers alike', () => {
    expect(sameContent('abc', Buffer.from('abc'))).toBe(true)
    expect(sameContent('abc', Buffer.from('abd'))).toBe(false)
    expect(sameContent(Buffer.from([1, 2]), Buffer.from([1, 2]))).toBe(true)
    expect(sameContent(Buffer.from([1, 2]), Buffer.from([1, 2, 3]))).toBe(false)
  })

  it('treats a missing file as a change', () => {
    expect(sameContent('', null)).toBe(false)
  })
})

describe('writeIfChanged', () => {
  it('leaves an identical file alone and writes a different or new one', async () => {
    expect(await writeIfChanged(at('schedule.js'), 'export const GAMES = [1]\n')).toBe(false)
    expect(await writeIfChanged(at('schedule.js'), 'export const GAMES = [2]\n')).toBe(true)
    expect(readFileSync(at('schedule.js'), 'utf8')).toBe('export const GAMES = [2]\n')
    expect(await writeIfChanged(at('new.png'), Buffer.from([9]))).toBe(true)
    expect(existsSync(at('new.png'))).toBe(true)
  })
})

describe('the data writer', () => {
  it('does NOT touch the stamp when every output matches what is on disk', async () => {
    const data = createDataWriter(meta, () => NOW)
    expect(await data.write(at('schedule.js'), 'export const GAMES = [1]\n')).toBe(false)
    expect(await data.write(at('atl.png'), Buffer.from([1, 2, 3]))).toBe(false)
    expect(data.stampedAt).toBeNull()
    expect(readFileSync(meta, 'utf8')).toBe(metaModule(OLD))
  })

  it('stamps when a data module changes', async () => {
    const data = createDataWriter(meta, () => NOW)
    await data.write(at('atl.png'), Buffer.from([1, 2, 3]))
    expect(await data.write(at('schedule.js'), 'export const GAMES = [1, 2]\n')).toBe(true)
    expect(data.stampedAt).toBe(NOW.toISOString())
    expect(readFileSync(meta, 'utf8')).toContain(`export const DATA_UPDATED_AT = '${NOW.toISOString()}'`)
  })

  it('stamps when only a logo changes', async () => {
    const data = createDataWriter(meta, () => NOW)
    await data.write(at('schedule.js'), 'export const GAMES = [1]\n')
    expect(await data.write(at('atl.png'), Buffer.from([1, 2, 4]))).toBe(true)
    expect(readFileSync(meta, 'utf8')).toBe(metaModule(NOW.toISOString()))
  })

  // The workflow retries a failed fetch. An attempt that wrote schedule.js and then died
  // has already stamped, so the next attempt, which finds schedule.js unchanged, still
  // commits a stamp that matches the data.
  it('stamps on the first change, once per run', async () => {
    let calls = 0
    const data = createDataWriter(meta, () => {
      calls++
      return NOW
    })
    await data.write(at('schedule.js'), 'export const GAMES = [3]\n')
    expect(readFileSync(meta, 'utf8')).toBe(metaModule(NOW.toISOString()))
    await data.write(at('atl.png'), Buffer.from([7]))
    await data.write(at('teams.js'), 'export const TEAMS = []\n')
    expect(calls).toBe(1)
  })
})
