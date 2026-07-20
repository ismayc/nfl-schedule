import { useMemo } from 'react'
import { dayKey, dayLabel } from '../utils/time.js'
import { TEAMS } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'
import GameCard from './GameCard.jsx'

// NFL's primary axis is the week number, not a weekday grid. Regular season is 18 weeks.
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1)

export default function WeekView({ games, tz, hideScores, week, onWeekChange, onOpen }) {
  // Regular season only — postseason carries no week number and lives in the bracket.
  const byWeek = useMemo(() => {
    const map = new Map()
    for (const g of games) {
      if (g.seasonType !== 'regular' || g.week == null) continue
      if (!map.has(g.week)) map.set(g.week, [])
      map.get(g.week).push(g)
    }
    return map
  }, [games])

  // Default to the first week that still has an unplayed game (no score yet), else the
  // last week that has games. Computed locally; the parent isn't told on mount.
  const defaultWeek = useMemo(() => {
    for (const w of WEEKS) {
      const list = byWeek.get(w)
      if (list?.some((g) => g.score == null)) return w
    }
    for (let i = WEEKS.length - 1; i >= 0; i--) {
      if (byWeek.get(WEEKS[i])?.length > 0) return WEEKS[i]
    }
    return 1
  }, [byWeek])

  const selected = week ?? defaultWeek
  const weekGames = byWeek.get(selected) || []

  // Group the selected week's games by viewer-day: days ascending, games by kickoff.
  const days = useMemo(() => {
    const map = new Map()
    for (const g of weekGames) {
      const key = dayKey(g.tip, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    for (const list of map.values()) list.sort((a, b) => a.tip.localeCompare(b.tip))
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [weekGames, tz])

  // Any team without a game this week is on bye. (Byes begin around week 5.)
  const byeTeams = useMemo(() => {
    const playing = new Set()
    for (const g of weekGames) {
      playing.add(g.home)
      playing.add(g.away)
    }
    return TEAMS.filter((t) => !playing.has(t.abbr))
  }, [weekGames])

  const canPrev = selected > WEEKS[0]
  const canNext = selected < WEEKS[WEEKS.length - 1]

  return (
    <section className="view schedule">
      <div className="view-head">
        <div>
          <h2>Week {selected}</h2>
          <p className="sub">
            {weekGames.length} game{weekGames.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="wk-nav">
          <button
            className="ghost"
            onClick={() => onWeekChange?.(selected - 1)}
            disabled={!canPrev}
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            className="ghost"
            onClick={() => onWeekChange?.(selected + 1)}
            disabled={!canNext}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className="wk-pills" role="tablist" aria-label="Select week">
        {WEEKS.map((w) => (
          <button
            key={w}
            className={`wk-pill ${w === selected ? 'is-active' : ''}`}
            role="tab"
            aria-selected={w === selected}
            onClick={() => onWeekChange?.(w)}
          >
            {w}
          </button>
        ))}
      </div>

      {byeTeams.length > 0 && (
        <div className="wk-bye">
          <span className="wk-bye-label">On bye</span>
          <span className="wk-bye-teams">
            {byeTeams.map((t) => (
              <TeamLogo key={t.abbr} abbr={t.abbr} size={20} className="wk-bye-logo" />
            ))}
          </span>
        </div>
      )}

      {days.length > 0 ? (
        days.map(([key, dayGames]) => (
          <div className="day" key={key}>
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
        ))
      ) : (
        <p className="empty">No games this week.</p>
      )}
    </section>
  )
}
