import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './data/schedule.js'
import { SEASON, TEAMS } from './data/teams.js'
import { LEAGUE } from './config/league.js'
import { detectTimezone, timezoneOptions, dayKey, todayKey } from './utils/time.js'
import { readState, writeState, VIEWS } from './utils/urlState.js'
import { applyLive, fetchLive, liveCount } from './services/espn.js'
import { useFollow } from './context/follow.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import StandingsView from './components/StandingsView.jsx'
import StatsView from './components/StatsView.jsx'
import Bracket from './components/Bracket.jsx'
import GameDetail from './components/GameDetail.jsx'
import WeekView from './components/WeekView.jsx'
import { downloadIcs } from './utils/ics.js'
import Toasts from './components/Toasts.jsx'
import TeamPanel from './components/TeamPanel.jsx'
import { detectEvents, eventKey } from './services/alerts.js'
import TeamLogo from './components/TeamLogo.jsx'

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000
const THEME_KEY = `${LEAGUE.storageKey}:theme`
const ALERTS_KEY = `${LEAGUE.storageKey}:alerts`

export default function App() {
  // Read the shared link once, on mount.
  const detectedTz = useMemo(detectTimezone, [])
  const initial = useMemo(() => readState(), [])

  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [view, setView] = useState(initial.view)
  const [tz, setTz] = useState(initial.tz || detectedTz)
  const [hideScores, setHideScores] = useState(initial.hide)
  const [team, setTeam] = useState(initial.team)
  const [week, setWeek] = useState(initial.week)
  const [onlyFollowed, setOnlyFollowed] = useState(initial.mine)
  const [showPast, setShowPast] = useState(initial.past)
  const [live, setLive] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [detail, setDetail] = useState(null)
  const [alerts, setAlerts] = useState(() => {
    try {
      return localStorage.getItem(ALERTS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [toasts, setToasts] = useState([])
  const [teamPanel, setTeamPanel] = useState(null)
  const prevGames = useRef(null)

  const { count: followedCount, followed } = useFollow()

  // Committed schedule + live overlay. Everything downstream is derived from this.
  const games = useMemo(() => applyLive(GAMES, live), [live])
  const nLive = useMemo(() => liveCount(games), [games])

  // Poll faster while games are in progress, and not at all once the season is over.
  const seasonOver = useMemo(
    () => games.length > 0 && games.every((g) => g.score || g.postponed || g.canceled),
    [games]
  )

  const load = useCallback(async (signal) => {
    try {
      const next = await fetchLive({ signal })
      if (!signal?.aborted) {
        setLive(next)
        setUpdatedAt(new Date())
      }
      // fetchLive uses Promise.allSettled and always resolves (per-request failures are
      // swallowed there), so this catch is unreachable defensive code.
      /* v8 ignore next 3 */
    } catch {
      /* offline or feed hiccup — committed data still renders */
    }
  }, [])

  useEffect(() => {
    if (seasonOver) return
    const ctrl = new AbortController()
    load(ctrl.signal)
    const id = setInterval(() => load(ctrl.signal), nLive ? LIVE_REFRESH_MS : IDLE_REFRESH_MS)
    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [load, nLive, seasonOver])

  // Notable-moment detection, diffed against the previous poll. Runs regardless of
  // whether alerts are on, so toggling it on mid-game doesn't replay old moments.
  useEffect(() => {
    const prev = prevGames.current
    prevGames.current = games
    if (!prev || !alerts) return

    const found = detectEvents(prev, games, {
      teams: onlyFollowed || followedCount ? followed : null,
    })
    if (!found.length) return

    setToasts((cur) => {
      const seen = new Set(cur.map((t) => t.key))
      const fresh = found.map((e) => ({ ...e, key: eventKey(e) })).filter((e) => !seen.has(e.key))
      return [...fresh, ...cur].slice(0, 4)
    })
  }, [games, alerts, followed, followedCount, onlyFollowed])

  useEffect(() => {
    if (!toasts.length) return
    const id = setTimeout(() => setToasts((cur) => cur.slice(0, -1)), 9000)
    return () => clearTimeout(id)
  }, [toasts])

  // Keep the URL in step with the view so any state is shareable.
  useEffect(() => {
    writeState(
      { view, tz, team, week, hide: hideScores, mine: onlyFollowed, past: showPast },
      detectedTz
    )
  }, [view, tz, team, week, hideScores, onlyFollowed, showPast, detectedTz])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* ignore */
    }
    setTheme(next)
  }

  // Filters apply to the schedule/week views only; standings always reflect the whole season.
  const scheduleGames = useMemo(() => {
    return games.filter((g) => {
      if (team && g.home !== team && g.away !== team) return false
      if (onlyFollowed && followedCount && !followed.has(g.home) && !followed.has(g.away)) return false
      return true
    })
  }, [games, team, onlyFollowed, followed, followedCount])

  const pastDayCount = useMemo(() => {
    const today = todayKey(tz)
    const keys = new Set()
    for (const g of scheduleGames) {
      const key = dayKey(g.tip, tz)
      if (key < today) keys.add(key)
    }
    return keys.size
  }, [scheduleGames, tz])

  const teamName = (t) => TEAMS.find((x) => x.abbr === t)?.displayName

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>
            {LEAGUE.title} <span className="season">{SEASON}</span>
          </h1>
          <p className="tagline">
            {LEAGUE.tagline}
            {nLive > 0 && (
              <span className="live-now">
                {' '}
                · <span className="dot" />
                {nLive} live now
              </span>
            )}
          </p>
        </div>
        <div className="top-actions">
          <label className="field">
            <span className="sr-only">Timezone</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)}>
              {timezoneOptions(tz).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`ghost ${hideScores ? 'on' : ''}`}
            onClick={() => setHideScores((v) => !v)}
            title="Spoiler-free mode"
            aria-pressed={hideScores}
          >
            {hideScores ? '🙈' : '👁'}
          </button>
          <button
            className={`ghost ${alerts ? 'on' : ''}`}
            onClick={() => {
              const next = !alerts
              setAlerts(next)
              try {
                localStorage.setItem(ALERTS_KEY, next ? '1' : '0')
              } catch {
                /* ignore */
              }
            }}
            title={alerts ? 'Live alerts on' : 'Live alerts off'}
            aria-pressed={alerts}
          >
            {alerts ? '🔔' : '🔕'}
          </button>
          <button className="ghost" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`view-btn ${view === v.id ? 'on' : ''}`}
            onClick={() => setView(v.id)}
            aria-current={view === v.id ? 'page' : undefined}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {(view === 'schedule' || view === 'week') && (
        <div className="filters">
          <label className="field">
            <span className="sr-only">Team</span>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {TEAMS.map((t) => (
                <option key={t.abbr} value={t.abbr}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </label>
          {followedCount > 0 && (
            <button
              className={`chip ${onlyFollowed ? 'on' : ''}`}
              onClick={() => setOnlyFollowed((v) => !v)}
              aria-pressed={onlyFollowed}
            >
              ★ My teams ({followedCount})
            </button>
          )}
          {team && (
            <button className="chip" onClick={() => setTeam('')}>
              <TeamLogo abbr={team} size={18} /> Clear
            </button>
          )}
          {view === 'schedule' && pastDayCount > 0 && (
            <button
              className={`chip ${showPast ? 'on' : ''}`}
              onClick={() => setShowPast((v) => !v)}
              aria-pressed={showPast}
              title={showPast ? 'Hide previous days' : 'Show previous days'}
            >
              <span aria-hidden="true">{showPast ? '▾' : '▸'}</span> {showPast ? 'Hide' : 'Show'} past
              days
              <span className="chip-count">{pastDayCount}</span>
            </button>
          )}
          <button
            className="chip"
            onClick={() =>
              downloadIcs(scheduleGames, {
                filename: team ? `${LEAGUE.id}-${team.toLowerCase()}.ics` : `${LEAGUE.id}-${SEASON}.ics`,
                name: team ? `${teamName(team)} ${SEASON}` : `${LEAGUE.name} ${SEASON}`,
              })
            }
            title="Download these games as a calendar file"
          >
            📅 Export{scheduleGames.length !== games.length ? ` (${scheduleGames.length})` : ''}
          </button>
        </div>
      )}

      <main>
        {view === 'schedule' && (
          <ScheduleView
            games={scheduleGames}
            tz={tz}
            hideScores={hideScores}
            showPast={showPast}
            onOpen={setDetail}
          />
        )}
        {view === 'week' && (
          <WeekView
            games={scheduleGames}
            tz={tz}
            hideScores={hideScores}
            week={week}
            onWeekChange={setWeek}
            onOpen={setDetail}
          />
        )}
        {view === 'standings' && <StandingsView games={games} onPick={setTeamPanel} />}
        {view === 'playoffs' && <Bracket games={games} tz={tz} onPick={setTeamPanel} />}
        {view === 'stats' && <StatsView games={games} tz={tz} onPickTeam={setTeamPanel} />}
      </main>

      <Toasts
        events={toasts}
        onOpen={(g) => setDetail(g)}
        onDismiss={(key) => setToasts((cur) => cur.filter((t) => t.key !== key))}
      />

      <TeamPanel
        abbr={teamPanel}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => setTeamPanel(null)}
        onSchedule={(t) => (setTeam(t), setView('schedule'))}
        onOpenGame={(g) => (setTeamPanel(null), setDetail(g))}
      />

      <GameDetail
        game={detail}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => setDetail(null)}
        onPickTeam={(t) => (setTeam(t), setView('schedule'))}
      />

      <footer className="foot">
        <p className="disclaimer">
          An unofficial fan-made project. Not affiliated with, endorsed by, or sponsored by the NFL.
          Team names and logos are trademarks of their respective owners. Schedule, results, and
          player data via{' '}
          <a href="https://www.espn.com/nfl/" target="_blank" rel="noopener noreferrer">
            ESPN
          </a>
          .
        </p>
        <div className="foot-row">
          <p className="credit">
            Created by{' '}
            <a href="https://chester.rbind.io" target="_blank" rel="noopener noreferrer">
              Chester Ismay
            </a>{' '}
            ·{' '}
            <a href="https://github.com/ismayc/nfl-schedule" target="_blank" rel="noopener noreferrer">
              View source on GitHub
            </a>
          </p>
          {updatedAt && (
            <span className="dim">
              Updated{' '}
              {updatedAt.toLocaleTimeString(LEAGUE.locale, { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      </footer>
    </div>
  )
}
