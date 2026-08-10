// Shared network transport for the family's data scripts. Node built-ins only.
//
// CANONICAL COPY — sports-viewer-meta/scripts/lib/fetch.mjs. Every family repo
// vendors this file byte-for-byte at scripts/lib/fetch.mjs, because the refresh
// workflows run with no `npm ci` and can only import Node built-ins and relative
// paths. Fix bugs HERE first, then re-vendor into the siblings;
// `sports-viewer-meta/scripts/check-fetch-sync.mjs` diffs every copy against
// this one.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1s, 2s, 4s, 8s, plus up to 500ms of jitter so parallel callers don't all retry
// in lockstep and re-create the burst that caused the failure.
export const backoffMs = (attempt) => 2 ** attempt * 1000 + Math.random() * 500

// Cap how many requests are in flight. Firing every team at once is a burst big
// enough to provoke the very 500s the retries then have to absorb. Six at a time
// is still fast and markedly gentler on the feed.
export const CONCURRENCY = 6

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

// ESPN 500s at random under load. A refresh makes ~90 calls, so with the old
// 3-try/1.5s policy a single blip failed the whole run — about once a week.
//
// Retry only what's worth retrying: a 5xx, a 429, or a network-level error. A 404
// or a 400 is a real answer and fails immediately rather than sleeping 15s first.
export async function fetchRetry(url, tries = 5) {
  let lastErr
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(backoffMs(attempt - 1))

    let res
    try {
      res = await fetch(url)
    } catch (err) {
      lastErr = err // DNS, connection reset, timeout — always worth another go
      continue
    }

    if (res.ok) return res
    if (res.status < 500 && res.status !== 429) throw new Error(`${url}\n  HTTP ${res.status}`)
    lastErr = new Error(`HTTP ${res.status}`)
  }
  throw new Error(`${url}\n  ${lastErr.message} — still failing after ${tries} attempts`)
}

export const getJson = async (url, tries) => (await fetchRetry(url, tries)).json()

export const getText = async (url, tries) => (await fetchRetry(url, tries)).text()
