import { useMemo, useRef, useEffect } from 'react'
import { dayKey, dayLabel, todayKey } from '../utils/time.js'
import GameCard from './GameCard.jsx'

export default function ScheduleView({ games, tz, hideScores, showPast = false, onOpen }) {
  const todayRef = useRef(null)
  const today = todayKey(tz)

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

  // Days are dropped whole rather than filtering individual games, so a game earlier
  // today still shows — "past" means a previous calendar day in the viewer's zone,
  // not simply a kickoff already in the past.
  const days = useMemo(
    () => (showPast ? allDays : allDays.filter(([key]) => key >= today)),
    [allDays, showPast, today]
  )

  // Land the viewer on today rather than at the season opener in September. Only needed
  // when past days are showing; otherwise today is already the first thing rendered.
  useEffect(() => {
    if (showPast) todayRef.current?.scrollIntoView({ block: 'start' })
  }, [showPast])

  if (!days.length) {
    return (
      <section className="view">
        <p className="empty">No games match those filters.</p>
      </section>
    )
  }

  return (
    <section className="view schedule">
      {days.map(([key, dayGames]) => (
        <div className={`day ${key === today ? 'is-today' : ''}`} key={key} ref={key === today ? todayRef : null}>
          <h3 className="day-head">
            <span>{dayLabel(key, tz)}</span>
            <span className="day-count">{dayGames.length} game{dayGames.length === 1 ? '' : 's'}</span>
          </h3>
          <div className="day-games">
            {dayGames.map((g) => (
              <GameCard key={g.id} game={g} tz={tz} hideScores={hideScores} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
