import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { SERVICE_CATALOG, LOCAL_CATALOG } from '../utils/watch.js'

const KEY = 'nfl:services'
// Local-channel keys come from the refreshed schedule data, so a feed ESPN stops
// naming simply drops out of VALID and the saved selection sheds it on next load.
const VALID = new Set([...SERVICE_CATALOG, ...LOCAL_CATALOG].map((s) => s.key))
const ServicesCtx = createContext(null)

// Inert fallback so components (and tests) render standalone without a provider —
// same contract as the follow context.
const FALLBACK = {
  services: [],
  has: () => false,
  toggle: () => {},
  clear: () => {},
  count: 0,
}

// The streaming services / TV packages this viewer has told us they subscribe to,
// stored by catalog key. Persisted per-device in localStorage like a followed team,
// deliberately not in the shareable URL.
export function ServicesProvider({ children }) {
  const [services, setServices] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '[]')
      // Drop keys the catalog no longer defines, so an old saved value can't linger.
      return Array.isArray(saved) ? saved.filter((k) => VALID.has(k)) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(services))
    } catch {
      /* private mode — the choice just won't persist */
    }
  }, [services])

  const toggle = useCallback((key) => {
    if (!VALID.has(key)) return
    setServices((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }, [])

  const value = useMemo(
    () => ({
      services,
      has: (key) => services.includes(key),
      toggle,
      clear: () => setServices([]),
      count: services.length,
    }),
    [services, toggle]
  )

  return <ServicesCtx.Provider value={value}>{children}</ServicesCtx.Provider>
}

export const useServices = () => useContext(ServicesCtx) || FALLBACK
