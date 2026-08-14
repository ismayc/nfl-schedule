import { useMemo, useRef, useEffect, useState } from 'react'
import { dayKey, dayLabel, todayKey } from '../utils/time.js'
import { PLAYOFF } from '../config/league.js'
import GameCard from './GameCard.jsx'

// How many upcoming game-DAYS the default view shows before collapsing the rest
// behind the "Later games" toggle. Counted in game-days (not calendar days), and an
// NFL fortnight of game-days spans roughly four to five season weeks since games
// cluster on ~3 days a week — the point is that a fresh rollover no longer renders
// the entire 272-game season on load. (Ported from the NBA viewer.)
export const RECENT_LOOKAHEAD_DAYS = 14

// A game's collapse bucket. Regular-season games group by week (1..18); postseason
// games group by round (Wild Card → Super Bowl), ordered right after week 18. The
// fetch script tags each postseason game with a round key (WC/DIV/CONF/SB); a round
// we don't recognise falls into a trailing generic "Postseason" group.
const ROUND_INDEX = Object.fromEntries(PLAYOFF.rounds.map((r, i) => [r.key, i]))
function bucketOf(g) {
  if (g.seasonType === 'regular') {
    return { order: g.week, key: `W${g.week}`, chip: `${g.week}`, label: `Week ${g.week}` }
  }
  const round = PLAYOFF.rounds[ROUND_INDEX[g.round]]
  return round
    ? { order: 100 + ROUND_INDEX[g.round], key: g.round, chip: round.short, label: round.name }
    : { order: 200, key: 'POST', chip: 'Postseason', label: 'Postseason' }
}

// Collapse the day list into ordered week/round sections, each keeping its own day
// sub-buckets so a section renders exactly like the flat list once open. (The
// `.month-*` class names and --month-jump-h are the family's shared collapse
// styling — months in the sibling viewers, weeks and rounds here.)
function bucketsOf(days) {
  const map = new Map() // key -> { order, key, chip, label, days: Map(dayKey -> games) }
  for (const [dk, games] of days) {
    for (const g of games) {
      const b = bucketOf(g)
      if (!map.has(b.key)) map.set(b.key, { ...b, days: new Map() })
      const byDay = map.get(b.key).days
      if (!byDay.has(dk)) byDay.set(dk, [])
      byDay.get(dk).push(g)
    }
  }
  return [...map.values()]
    .sort((a, b) => a.order - b.order)
    .map((b) => ({
      key: b.key,
      chip: b.chip,
      label: b.label,
      days: [...b.days.entries()].sort(([a], [c]) => a.localeCompare(c)),
      count: [...b.days.values()].reduce((n, gs) => n + gs.length, 0),
    }))
}

export default function ScheduleView({ games, tz, hideScores, showPast = false, onOpen }) {
  const today = todayKey(tz)
  const monthJumpRef = useRef(null)
  const weekRefs = useRef({})
  const dayRefs = useRef({})

  // Bucket by the calendar day the viewer sees, not by UTC date.
  const allDays = useMemo(() => {
    const map = new Map()
    for (const g of games) {
      const key = dayKey(g.tip, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [games, tz])

  // The "Later games" collapse is deliberately component-local, like the per-day
  // folding below: it is never written to the URL or localStorage, so it can't add a
  // persisted readState key (which would break the family's deep-equal link tests).
  const [showLater, setShowLater] = useState(false)

  // Days are dropped whole rather than filtering individual games, so a game earlier
  // today still shows — "past" means a previous calendar day in the viewer's zone.
  // The default view caps at the next fortnight of game-days, with the rest of the
  // upcoming season behind "Later games"; Full season (showPast) shows everything.
  const { days, laterCount } = useMemo(() => {
    if (showPast) return { days: allDays, laterCount: 0 }
    const upcoming = allDays.filter(([key]) => key >= today)
    const hidden = showLater ? [] : upcoming.slice(RECENT_LOOKAHEAD_DAYS)
    return {
      days: hidden.length ? upcoming.slice(0, RECENT_LOOKAHEAD_DAYS) : upcoming,
      laterCount: hidden.reduce((n, [, gs]) => n + gs.length, 0),
    }
  }, [allDays, showPast, showLater, today])

  // Full-season week/round grouping — what the collapsed "show past" view renders.
  const weeks = useMemo(() => bucketsOf(allDays), [allDays])

  // Where the landing (and a "Today" jump) goes: today if it has games, else the
  // next game-day, else (the whole season already past) the last one.
  const nowKey = useMemo(() => {
    const upcoming = allDays.find(([key]) => key >= today)
    return (upcoming || allDays[allDays.length - 1])?.[0] ?? null
  }, [allDays, today])

  // The week/round holding the landing day (opens on load) and the one holding
  // today (flagged in the jump-bar — null when today itself has no game).
  const nowWeek = weeks.find((w) => w.days.some(([k]) => k === nowKey))?.key ?? null
  const currentWeek = weeks.find((w) => w.days.some(([k]) => k === today))?.key ?? null

  const [expanded, setExpanded] = useState(() => new Set([nowWeek]))
  // Per-day folding and per-day spoiler overrides — component-local, like the
  // sibling viewers: a folded day is a reading position, not a shareable preference.
  const [foldedDays, setFoldedDays] = useState(() => new Set())
  const [dayOverrides, setDayOverrides] = useState({})

  const toggleDay = (key) =>
    setFoldedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  // Sticky per day and beats the global spoiler toggle, in both directions.
  const scoresHidden = (key) => (key in dayOverrides ? dayOverrides[key] : hideScores)
  const toggleReveal = (key) =>
    setDayOverrides((prev) => ({ ...prev, [key]: !scoresHidden(key) }))

  const [pendingScroll, setPendingScroll] = useState(null)

  const toggleWeek = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const jumpToWeek = (key) => {
    setExpanded((prev) => new Set(prev).add(key))
    setPendingScroll(key)
  }
  // "Today" jump: open the week holding the landing day and scroll to that day
  // itself (today, or the next game-day when today is idle) — not the week header.
  const jumpToToday = () => {
    setExpanded((prev) => new Set(prev).add(nowWeek))
    setPendingScroll(nowKey)
  }
  const jumpToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  // Landing scroll (full season only): the "now" day, which its open week renders.
  useEffect(() => {
    if (!showPast) return
    dayRefs.current[nowKey]?.scrollIntoView({ block: 'start' })
  }, [showPast, nowKey])

  // Jump scroll: a day key resolves via dayRefs, a week key via weekRefs. Clearing
  // pendingScroll re-runs this, but the guard makes the second pass a no-op.
  useEffect(() => {
    if (pendingScroll == null) return
    const el = dayRefs.current[pendingScroll] || weekRefs.current[pendingScroll]
    el?.scrollIntoView({ block: 'start' })
    setPendingScroll(null)
  }, [pendingScroll])

  // Publish the sticky jump-bar's height as --month-jump-h so a day/week scrolled to
  // `block: 'start'` clears it instead of landing behind it. 0 in the default view,
  // where the bar isn't rendered.
  useEffect(() => {
    const publish = () =>
      document.documentElement.style.setProperty(
        '--month-jump-h',
        `${monthJumpRef.current?.offsetHeight ?? 0}px`
      )
    publish()
    window.addEventListener('resize', publish)
    return () => window.removeEventListener('resize', publish)
  }, [showPast, weeks.length])

  if (!days.length) {
    return (
      <section className="view">
        <p className="empty">No games match those filters.</p>
      </section>
    )
  }

  const renderDay = ([key, dayGames]) => {
    const folded = foldedDays.has(key)
    const hidden = scoresHidden(key)
    return (
      <div
        className={`day ${key === today ? 'is-today' : ''}`}
        key={key}
        id={`day-${key}`}
        ref={(el) => (dayRefs.current[key] = el)}
      >
        <h3 className="day-head">
          <button
            className="day-fold"
            onClick={() => toggleDay(key)}
            aria-expanded={!folded}
            aria-label={`${folded ? 'Show' : 'Hide'} games on ${dayLabel(key, tz)}`}
          >
            <span className="day-caret" aria-hidden="true">
              {folded ? '▸' : '▾'}
            </span>
            <span className="day-name">{dayLabel(key, tz)}</span>
          </button>
          <span className="day-count">
            {dayGames.length} game{dayGames.length === 1 ? '' : 's'}
          </span>
          <button
            className="day-eye"
            onClick={() => toggleReveal(key)}
            aria-pressed={hidden}
            title={hidden ? 'Show scores for this day' : 'Hide scores for this day'}
          >
            {hidden ? '🙈' : '👁'}
          </button>
        </h3>
        {!folded && (
          <div className="day-games">
            {dayGames.map((g) => (
              <GameCard key={g.id} game={g} tz={tz} hideScores={hidden} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Default view: today onward as a plain flat list — short by design. The rest of
  // the upcoming season sits behind a toggle mirroring the "Earlier games" chip.
  if (!showPast) {
    return (
      <section className="view schedule">
        {days.map(renderDay)}
        {laterCount > 0 && (
          <button
            className="chip later-toggle"
            onClick={() => setShowLater(true)}
            title="Show the rest of the upcoming season"
          >
            <span aria-hidden="true">▸</span> Later games
            <span className="chip-count">{laterCount}</span>
          </button>
        )}
        {showLater && (
          <button
            className="chip later-toggle"
            onClick={() => setShowLater(false)}
            title="Collapse back to the next fortnight of game-days"
          >
            <span aria-hidden="true">▾</span> Later games
          </button>
        )}
      </section>
    )
  }

  // Full season: a sticky week/round jump-bar over collapsible sections, only the
  // one holding "now" open to start.
  return (
    <section className="view schedule">
      <nav className="month-jump" aria-label="Jump to week" ref={monthJumpRef}>
        {weeks.map((w) => (
          <button
            key={w.key}
            type="button"
            className={`chip month-chip ${w.key === currentWeek ? 'is-current' : ''}`}
            onClick={() => jumpToWeek(w.key)}
          >
            {w.chip}
          </button>
        ))}
        <button type="button" className="chip month-chip month-top" onClick={jumpToTop}>
          ↑ Top
        </button>
        <button type="button" className="chip month-chip month-today" onClick={jumpToToday}>
          Today
        </button>
      </nav>
      {weeks.map((w) => {
        const open = expanded.has(w.key)
        return (
          <div className="month" key={w.key} ref={(el) => (weekRefs.current[w.key] = el)}>
            <button
              type="button"
              className={`month-head ${open ? 'open' : ''}`}
              onClick={() => toggleWeek(w.key)}
              aria-expanded={open}
            >
              <span aria-hidden="true">{open ? '▾' : '▸'}</span> <span>{w.label}</span>
              <span className="month-count">
                {w.count} game{w.count === 1 ? '' : 's'}
              </span>
            </button>
            {open && <div className="month-days">{w.days.map(renderDay)}</div>}
          </div>
        )
      })}
    </section>
  )
}
