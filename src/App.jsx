import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './data/schedule.js'
import { SEASON, TEAMS } from './data/teams.js'
import { LEAGUE } from './config/league.js'
import { detectTimezone, timezoneOptions, dayKey, todayKey } from './utils/time.js'
import { readState, writeState, VIEWS } from './utils/urlState.js'
import { parseQuery, matchesSearch } from './utils/search.js'
import { watchableServices } from './utils/watch.js'
import { applyLive, fetchLive, liveCount } from './services/espn.js'
import { useFollow } from './context/follow.jsx'
import { useServices } from './context/services.jsx'
import ServicesModal from './components/ServicesModal.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import StandingsView from './components/StandingsView.jsx'
import StatsView from './components/StatsView.jsx'
import HistoryView from './components/HistoryView.jsx'
import { HISTORY } from './data/history.js'
import Bracket from './components/Bracket.jsx'
import GameDetail from './components/GameDetail.jsx'
import WeekView from './components/WeekView.jsx'
import CalendarModal from './components/CalendarModal.jsx'
import Toasts from './components/Toasts.jsx'
import TeamPanel from './components/TeamPanel.jsx'
import PlayerModal from './components/PlayerModal.jsx'
import { detectEvents, eventKey } from './services/alerts.js'
import TeamLogo from './components/TeamLogo.jsx'

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000
const THEME_KEY = `${LEAGUE.storageKey}:theme`
const ALERTS_KEY = `${LEAGUE.storageKey}:alerts`
const WATCH_KEY = `${LEAGUE.storageKey}:watchOnly`

// One-click examples that demonstrate the scoped-search syntax, each matched to
// something that really appears in the committed schedule.
const SEARCH_EXAMPLES = ['team: Chiefs', 'city: Kansas City', 'venue: Arrowhead', 'tv: NBC']

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
  // Which archived season the History view is showing — in the URL so a link to a past
  // season is shareable, like the NBA and Premier League siblings.
  const [season, setSeason] = useState(initial.season)
  const [onlyFollowed, setOnlyFollowed] = useState(initial.mine)
  const [showPast, setShowPast] = useState(initial.past)
  // Free-text / scoped search over the schedule. Deliberately component-local — it
  // is never written to the URL or localStorage, so it can't add a persisted key or
  // change any shared link (which would break the deep-link tests).
  const [search, setSearch] = useState('')
  // "On my services": show only games carried by a service the viewer has. Remembered
  // per-device (like the followed set), not in the shared URL.
  const [watchOnly, setWatchOnly] = useState(() => {
    try {
      return localStorage.getItem(WATCH_KEY) === '1'
    } catch {
      return false
    }
  })
  // The filter panel starts open when a shared link already applies a team/followed
  // filter (or a device-remembered watch filter), so an active filter is never hidden
  // behind a closed panel.
  const [filtersOpen, setFiltersOpen] = useState(
    () => Boolean(initial.team) || Boolean(initial.mine) || watchOnly
  )
  const [live, setLive] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  // A ?game= deep link opens straight onto that game's detail (see urlState.js).
  const [detail, setDetail] = useState(
    () => (initial.game && GAMES.find((g) => g.id === initial.game)) || null
  )
  const [alerts, setAlerts] = useState(() => {
    try {
      return localStorage.getItem(ALERTS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [toasts, setToasts] = useState([])
  const [teamPanel, setTeamPanel] = useState(null)
  // Which season the open team panel describes. null = the live one; a year
  // means it was opened from the History view and must show that season.
  const [panelYear, setPanelYear] = useState(null)
  const [playerModal, setPlayerModal] = useState(null)
  const [showCalendar, setShowCalendar] = useState(false)
  // Opening a team from anywhere in the live season; the History view uses the
  // variant below, which remembers which season the click came from.
  const pickTeam = (abbr) => (setPanelYear(null), setTeamPanel(abbr))
  const pickHistoryTeam = (abbr, year) => (setPanelYear(year), setTeamPanel(abbr))
  const [showServices, setShowServices] = useState(false)
  const prevGames = useRef(null)
  const filterBarRef = useRef(null)

  const { count: followedCount, followed } = useFollow()
  const { services, count: serviceCount } = useServices()

  // Parse the search box once per keystroke, not once per game.
  const parsedSearch = useMemo(() => parseQuery(search), [search])

  // Committed schedule + live overlay. Everything downstream is derived from this.
  const games = useMemo(() => applyLive(GAMES, live), [live])
  const nLive = useMemo(() => liveCount(games), [games])
  // The archived season a History-opened panel describes, or null for the live one.
  const panelSeason = panelYear == null ? null : HISTORY.find((x) => x.year === panelYear)

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
      { view, tz, team, week, season, hide: hideScores, mine: onlyFollowed, past: showPast },
      detectedTz
    )
  }, [view, tz, team, week, season, hideScores, onlyFollowed, showPast, detectedTz])

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
      // A no-op until services are chosen, so clearing them all can't empty the list.
      // A game whose broadcast is unknown is kept — "not announced" isn't "can't watch".
      if (watchOnly && serviceCount && g.broadcast?.length && watchableServices(g.broadcast, services).length === 0)
        return false
      // An empty query matches everything, so this is a no-op until something is typed.
      if (!matchesSearch(g, parsedSearch)) return false
      return true
    })
  }, [games, team, onlyFollowed, followed, followedCount, watchOnly, services, serviceCount, parsedSearch])

  // How many filters are actively narrowing the schedule — drives the toggle badge
  // and the auto-open. A followed/watch toggle only counts once there are teams/
  // services for it to act on, mirroring what scheduleGames applies.
  const activeFilterCount = useMemo(() => {
    let n = 0
    if (search.trim()) n++
    if (team) n++
    if (onlyFollowed && followedCount) n++
    if (watchOnly && serviceCount) n++
    return n
  }, [search, team, onlyFollowed, followedCount, watchOnly, serviceCount])

  const clearAllFilters = () => {
    setSearch('')
    setTeam('')
    setOnlyFollowed(false)
    setWatchOnly(false)
    try {
      localStorage.setItem(WATCH_KEY, '0')
    } catch {
      /* private mode — the preference just won't persist */
    }
  }

  const pastDayCount = useMemo(() => {
    const today = todayKey(tz)
    const keys = new Set()
    for (const g of scheduleGames) {
      const key = dayKey(g.tip, tz)
      if (key < today) keys.add(key)
    }
    return keys.size
  }, [scheduleGames, tz])

  // Publish the sticky filter bar's height as --filter-bar-h so ScheduleView's own
  // sticky .month-jump can pin directly beneath it instead of behind it. Re-measured
  // whenever the bar's height can change (panel open/close, view switch, the earlier-
  // games chip appearing) and on window resize (the bar wraps on narrow screens).
  useEffect(() => {
    const el = filterBarRef.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--filter-bar-h', `${el.offsetHeight}px`)
    publish()
    window.addEventListener('resize', publish)
    return () => window.removeEventListener('resize', publish)
  }, [filtersOpen, activeFilterCount, view, pastDayCount, showPast, followedCount, serviceCount])

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
        <div className="filter-bar" ref={filterBarRef}>
          <div className="filter-controls">
            <button
              className={`chip filter-toggle ${filtersOpen ? 'on' : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-controls="filters-panel"
            >
              ⚙ Filters
              {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
              <span className="chev" aria-hidden="true">
                {filtersOpen ? '▲' : '▼'}
              </span>
            </button>
            {activeFilterCount > 0 && (
              <button className="chip filter-clear" onClick={clearAllFilters}>
                Clear all
              </button>
            )}
            {view === 'schedule' && pastDayCount > 0 && (
              <button
                className={`chip ${showPast ? 'on' : ''}`}
                onClick={() => setShowPast((v) => !v)}
                aria-pressed={showPast}
                title={showPast ? 'Hide previous days' : 'Also show earlier games, back to the opener'}
              >
                <span aria-hidden="true">{showPast ? '▾' : '▸'}</span> Earlier games
                <span className="chip-count">{pastDayCount}</span>
              </button>
            )}
            <button
              className="chip"
              onClick={() => setShowCalendar(true)}
              title="Subscribe to or download a calendar of these games"
            >
              📅 Calendar
            </button>
          </div>

          {filtersOpen && (
            <div className="filters-panel" id="filters-panel">
              <div className="filters">
                <label className="field search-field">
                  <span className="sr-only">Search games</span>
                  <input
                    className="search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder='Search — try "team: Chiefs" or "city: Kansas City"'
                  />
                </label>
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
                {serviceCount === 0 ? (
                  <button
                    className="chip"
                    onClick={() => setShowServices(true)}
                    title="Pick the streaming services and TV packages you have"
                  >
                    📺 Choose my services
                  </button>
                ) : (
                  <span className="chip-group">
                    <button
                      className={`chip ${watchOnly ? 'on' : ''}`}
                      onClick={() => {
                        const next = !watchOnly
                        setWatchOnly(next)
                        try {
                          localStorage.setItem(WATCH_KEY, next ? '1' : '0')
                        } catch {
                          /* private mode — the filter just won't be remembered */
                        }
                      }}
                      aria-pressed={watchOnly}
                      title="Only show games on my services"
                    >
                      📺 On my services ({serviceCount})
                    </button>
                    <button
                      className="chip chip-icon"
                      onClick={() => setShowServices(true)}
                      aria-label="Edit my services"
                      title="Edit my services"
                    >
                      ⚙
                    </button>
                  </span>
                )}
                {team && (
                  <button className="chip" onClick={() => setTeam('')}>
                    <TeamLogo abbr={team} size={18} /> Clear
                  </button>
                )}
              </div>
              <div className="search-hints">
                <span className="hint-label">Try:</span>
                {SEARCH_EXAMPLES.map((ex) => (
                  <button key={ex} className="hint-chip" onClick={() => setSearch(ex)}>
                    {ex}
                  </button>
                ))}
                <span className="hint-note">fields: team · city · venue · broadcast</span>
              </div>
            </div>
          )}
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
        {view === 'standings' && <StandingsView games={games} onPick={pickTeam} />}
        {view === 'playoffs' && (
          <Bracket games={games} tz={tz} onPick={pickTeam} onOpen={setDetail} />
        )}
        {view === 'stats' && (
          <StatsView
            games={games}
            tz={tz}
            onPickTeam={pickTeam}
            onPickPlayer={setPlayerModal}
            onOpen={setDetail}
          />
        )}
        {view === 'history' && (
          <HistoryView
            season={season}
            onSeason={setSeason}
            tz={tz}
            onPick={pickHistoryTeam}
            onPickPlayer={setPlayerModal}
            onOpen={setDetail}
          />
        )}
      </main>

      <Toasts
        events={toasts}
        onOpen={(g) => setDetail(g)}
        onDismiss={(key) => setToasts((cur) => cur.filter((t) => t.key !== key))}
      />

      <TeamPanel
        abbr={teamPanel}
        season={panelSeason}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => (setTeamPanel(null), setPanelYear(null))}
        onSchedule={(t) => (setTeam(t), setView('schedule'))}
        onOpenGame={(g) => (setTeamPanel(null), setPanelYear(null), setDetail(g))}
        onPickPlayer={setPlayerModal}
      />

      <PlayerModal player={playerModal} onClose={() => setPlayerModal(null)} />

      <GameDetail
        game={detail}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => setDetail(null)}
        onPickTeam={(t) => (setTeam(t), setView('schedule'))}
      />

      {showCalendar && (
        <CalendarModal
          games={games}
          filtered={scheduleGames}
          onClose={() => setShowCalendar(false)}
        />
      )}
      {showServices && <ServicesModal onClose={() => setShowServices(false)} />}

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
