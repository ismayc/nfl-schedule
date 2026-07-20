import { useMemo } from 'react'
import { dayKey, formatTime } from '../utils/time.js'
import { LEAGUE } from '../config/league.js'
import { TEAMS } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// NFL's primary axis is the week number, not a weekday grid. Regular season is 18 weeks.
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1)

// Kickoff windows, bucketed by the Eastern-time hour — the way an NFL week is actually
// consumed. Sunday spans all three; Thursday/Monday are single night games.
const ET_HOUR = (iso) =>
  Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(
      new Date(iso)
    )
  ) % 24
const SLOTS = [
  { key: 'early', label: 'Early', in: (h) => h < 15 },
  { key: 'late', label: 'Afternoon', in: (h) => h >= 15 && h < 18 },
  { key: 'night', label: 'Night', in: () => true }, // catch-all: anything at/after 6pm ET
]
const slotKeyOf = (iso) => SLOTS.find((s) => s.in(ET_HOUR(iso))).key

function WkCell({ game, tz, hideScores, followed, onOpen }) {
  const final = !!game.score
  const [hs, as] = game.score || [null, null]
  const mine = followed.has(game.home) || followed.has(game.away)
  const label = game.postponed
    ? 'Postponed'
    : game.canceled
      ? 'Canceled'
      : game.live
        ? game.statusLabel || 'Live'
        : final
          ? `Final${game.ot ? '/OT' : ''}`
          : formatTime(game.tip, tz)

  const side = (abbr, mineScore, won) => (
    <span className={`wkg-row ${won ? 'won' : ''}`}>
      <TeamLogo abbr={abbr} size={18} />
      <b className="wkg-abbr">{abbr}</b>
      {final && !hideScores && <em className="wkg-score">{mineScore}</em>}
    </span>
  )

  return (
    <button
      type="button"
      className={`wkg-cell ${mine ? 'is-mine' : ''} ${game.live ? 'is-live' : ''}`}
      onClick={() => onOpen?.(game)}
    >
      {side(game.away, as, final && as > hs)}
      {side(game.home, hs, final && hs > as)}
      <span className={`wkg-foot ${game.live ? 'is-live' : ''}`}>{label}</span>
    </button>
  )
}

export default function WeekView({ games, tz, hideScores, week, onWeekChange, onOpen }) {
  const { followed } = useFollow()

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
      if (byWeek.get(w)?.some((g) => g.score == null)) return w
    }
    for (let i = WEEKS.length - 1; i >= 0; i--) {
      if (byWeek.get(WEEKS[i])?.length > 0) return WEEKS[i]
    }
    return 1
  }, [byWeek])

  const selected = week ?? defaultWeek
  const weekGames = byWeek.get(selected) || []

  // Day columns for the selected week: one per game-day (Thu · Sat · Sun · Mon), and
  // within each, the games grouped by kickoff window so the busy Sunday slate reads as
  // early / afternoon / night rather than one long stack.
  const columns = useMemo(() => {
    const byDay = new Map()
    for (const g of weekGames) {
      const key = dayKey(g.tip, tz)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(g)
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dayGames]) => {
        dayGames.sort((a, b) => a.tip.localeCompare(b.tip))
        const first = dayGames[0].tip
        const slots = SLOTS.map((s) => ({
          ...s,
          games: dayGames.filter((g) => slotKeyOf(g.tip) === s.key),
        })).filter((s) => s.games.length > 0)
        return {
          key,
          dow: new Intl.DateTimeFormat(LEAGUE.locale, { timeZone: tz, weekday: 'long' }).format(new Date(first)),
          date: new Intl.DateTimeFormat(LEAGUE.locale, { timeZone: tz, month: 'short', day: 'numeric' }).format(
            new Date(first)
          ),
          count: dayGames.length,
          slots,
          multiSlot: slots.length > 1,
        }
      })
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
    <section className="view week-view">
      <div className="view-head">
        <div>
          <h2>Week {selected}</h2>
          <p className="sub">
            {weekGames.length} game{weekGames.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="wk-nav">
          <button className="ghost" onClick={() => onWeekChange?.(selected - 1)} disabled={!canPrev} aria-label="Previous week">
            ‹
          </button>
          <button className="ghost" onClick={() => onWeekChange?.(selected + 1)} disabled={!canNext} aria-label="Next week">
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

      {columns.length > 0 ? (
        <div className="wkg-grid">
          {columns.map((col) => (
            <div className="wkg-col" key={col.key}>
              <div className="wkg-head">
                <span className="wkg-dow">{col.dow}</span>
                <span className="wkg-date">{col.date}</span>
              </div>
              {col.slots.map((slot) => (
                <div className="wkg-slot" key={slot.key}>
                  {col.multiSlot && <div className="wkg-slot-label">{slot.label}</div>}
                  {slot.games.map((g) => (
                    <WkCell key={g.id} game={g} tz={tz} hideScores={hideScores} followed={followed} onOpen={onOpen} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">No games this week.</p>
      )}
    </section>
  )
}
