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

// A browser-like User-Agent. ESPN's edge (Akamai) intermittently answers requests
// carrying undici's default `node` UA with 403 — especially from cloud runner IP
// ranges under an unattended refresh — so a real UA string makes the feed treat the
// job like any other client. The `wnba/teams` call 403'd the whole run this way on
// 2026-08-16 (run 31939735367).
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: '*/*',
}

// Optional fallback egress. ESPN's edge blocks a subset of GitHub's Azure runner IPs;
// when a run lands on a blocked one, EVERY call from it 403s (retrying on the same runner
// can't help — same IP). Routing through a proxy that egresses from a non-GitHub IP gets
// through. Set ESPN_PROXY to such a proxy's base URL — the contract is a GET to
// `<ESPN_PROXY>?url=<url-encoded target>` that fetches the target and streams it back
// (a free Cloudflare Worker does this; see sports-viewer-meta/docs/ESPN-PROXY.md). Unset,
// the default, means direct requests only — nothing changes.
const PROXY = ((typeof process !== 'undefined' && process.env.ESPN_PROXY) || '').replace(/\/+$/, '')
const proxied = (url) => `${PROXY}?url=${encodeURIComponent(url)}`

// Once a direct request has failed and the proxy has taken over, every remaining request
// this run goes straight through the proxy: the block is per-IP, so the rest would 403
// direct too, and paying the direct-failure tax on all ~90 calls would waste minutes.
// Latched per process — a fresh run (fresh runner) starts direct again.
let proxyLatched = false

// ESPN 500s at random under load. A refresh makes ~90 calls, so with the old
// 3-try/1.5s policy a single blip failed the whole run — about once a week.
//
// Retry what's transient: a 5xx, a 429, a 403, or a network-level error. ESPN returns
// 403 as a soft anti-bot throttle that clears on a moment's backoff, so it belongs with
// the transient statuses rather than the real answers — a definitive 400/404/410 still
// fails immediately rather than sleeping 15s first.
async function attemptCycle(target, tries) {
  let lastErr
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(backoffMs(attempt - 1))

    let res
    try {
      res = await fetch(target, { headers: HEADERS })
    } catch (err) {
      lastErr = err // DNS, connection reset, timeout — always worth another go
      continue
    }

    if (res.ok) return res
    if (res.status < 500 && res.status !== 429 && res.status !== 403)
      throw new Error(`${target}\n  HTTP ${res.status}`)
    lastErr = new Error(`HTTP ${res.status}`)
  }
  throw new Error(`${target}\n  ${lastErr.message} — still failing after ${tries} attempts`)
}

// Try direct first; if it exhausts its retries and a proxy is configured, fall back to
// the proxy (and latch it for the rest of the run). With no proxy set this is exactly the
// old direct-only behaviour.
export async function fetchRetry(url, tries = 5) {
  if (PROXY && proxyLatched) return attemptCycle(proxied(url), tries)
  try {
    return await attemptCycle(url, tries)
  } catch (err) {
    if (!PROXY) throw err
    proxyLatched = true
    return attemptCycle(proxied(url), tries)
  }
}

export const getJson = async (url, tries) => (await fetchRetry(url, tries)).json()

export const getText = async (url, tries) => (await fetchRetry(url, tries)).text()
