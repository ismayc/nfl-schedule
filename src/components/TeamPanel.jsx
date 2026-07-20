import { useMemo } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { playoffPicture } from '../utils/standings.js'
import { playersByTeam } from '../utils/stats.js'
import { formatDate, formatTime, liveState } from '../utils/time.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)
const signed = (n) => (n > 0 ? `+${n}` : String(n)) // point differential is a whole number
const rec = (r) => (r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`)

// A completed result → the letter and colour class for its chip. A tie is its own
// outcome ('t'), not a rounded win or loss.
const RES = { w: 'W', l: 'L', t: 'T' }

// Roster stat line, chosen by position and degrading gracefully when a field is
// missing (PLAYERS is empty until the season starts, so this often renders nothing).
function playerLine(p) {
  if (p.passYds != null && p.pos === 'QB') {
    return [
      [p.passYds, 'yds'],
      [p.passTD ?? 0, 'TD'],
    ]
  }
  if (p.rushYds != null && (p.pos === 'RB' || (p.recYds ?? 0) < p.rushYds)) {
    return p.rushTD != null
      ? [
          [p.rushYds, 'rush yds'],
          [p.rushTD, 'TD'],
        ]
      : [[p.rushYds, 'rush yds']]
  }
  if (p.recYds != null) {
    return [
      [p.recYds, 'rec yds'],
      [p.rec ?? 0, 'rec'],
    ]
  }
  // Last resort — whatever scrimmage yardage we have.
  return [[(p.passYds ?? 0) + (p.rushYds ?? 0) + (p.recYds ?? 0), 'yds']]
}

// Form as a strip of results, oldest first — the same read as the standings, with the
// opponent attached to each chip.
function Form({ results, onOpen, gamesById }) {
  return (
    <div className="tp-form">
      {results.slice(-5).map((r) => (
        <button
          key={r.id}
          className={`tp-chip ${r.res}`}
          onClick={() => onOpen?.(gamesById.get(r.id))}
          title={`${r.res === 'w' ? 'Won' : r.res === 'l' ? 'Lost' : 'Tied'} ${r.pf}–${r.pa} ${
            r.side === 'home' ? 'vs' : 'at'
          } ${TEAM_BY_ABBR[r.opp]?.name}`}
        >
          {RES[r.res]}
        </button>
      ))}
    </div>
  )
}

export default function TeamPanel({ abbr, games, tz, hideScores, onClose, onSchedule, onOpenGame }) {
  const ref = useModalA11y(onClose, !!abbr)
  const { isFollowed, toggle } = useFollow()

  // playoffPicture carries the full standings row plus seed / remaining / clinch state,
  // so a single call feeds the header, tiles, and form.
  const picture = useMemo(() => playoffPicture(games), [games])
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])
  const row = useMemo(
    () => (abbr ? [...picture.AFC, ...picture.NFC].find((r) => r.abbr === abbr) : null),
    [picture, abbr]
  )
  const roster = useMemo(() => (abbr ? playersByTeam(abbr).slice(0, 6) : []), [abbr])

  const upcoming = useMemo(() => {
    if (!abbr) return []
    return games
      .filter((g) => (g.home === abbr || g.away === abbr) && !g.score && !g.postponed && !g.canceled)
      .slice(0, 5)
  }, [games, abbr])

  if (!abbr || !row) return null
  const team = TEAM_BY_ABBR[abbr]
  const followed = isFollowed(abbr)

  const record = row.t ? `${row.w}–${row.l}–${row.t}` : `${row.w}–${row.l}`
  const homeAway = (g) => (g.home === abbr ? g.away : g.home)
  const prefix = (g) => (g.home === abbr ? 'vs' : 'at')

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={team.displayName} ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="tp-head">
          <TeamLogo abbr={abbr} size={54} />
          <div>
            <h3 className="tp-name">{team.displayName}</h3>
            <p className="tp-sub">
              {record} · {row.division} · seed {row.seed}
              {row.clinched && <span className="badge badge-in"> ✓ clinched</span>}
              {row.eliminated && <span className="badge badge-out"> ✕ eliminated</span>}
            </p>
          </div>
          <button
            className={`chip ${followed ? 'on' : ''}`}
            onClick={() => toggle(abbr)}
            aria-pressed={followed}
          >
            {followed ? '★ Following' : '☆ Follow'}
          </button>
        </div>

        <div className="tp-stats">
          {[
            ['For', one(row.ppg)],
            ['Against', one(row.oppPpg)],
            ['Diff', signed(row.diff)],
            ['Home', rec(row.home)],
            ['Road', rec(row.road)],
            ['Left', row.remaining],
          ].map(([label, v]) => (
            <div className="tp-stat" key={label}>
              <span className="tp-stat-v">{v}</span>
              <span className="tp-stat-l">{label}</span>
            </div>
          ))}
        </div>

        {row.results.length > 0 && !hideScores && (
          <>
            <h4 className="md-sub">Last 5</h4>
            <Form results={row.results} onOpen={onOpenGame} gamesById={gamesById} />
          </>
        )}

        {roster.length > 0 && (
          <>
            <h4 className="md-sub">Leaders</h4>
            <div className="tp-roster">
              {roster.map((p) => (
                <div className="tp-player" key={p.id}>
                  <span className="tp-p-name">
                    {p.name}
                    <span className="lead-pos">{p.pos}</span>
                  </span>
                  <span className="tp-p-line">
                    {playerLine(p).map(([v, u], i) => (
                      <span key={u}>
                        {i > 0 && ' · '}
                        {v} <i>{u}</i>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {upcoming.length > 0 && (
          <>
            <h4 className="md-sub">Next up</h4>
            <ul className="drill">
              {upcoming.map((g) => (
                <li key={g.id}>
                  <span className="drill-date">{formatDate(g.tip, tz)}</span>
                  <span className="dim">{prefix(g)}</span>
                  <TeamLogo abbr={homeAway(g)} size={18} />
                  <span>{TEAM_BY_ABBR[homeAway(g)]?.name}</span>
                  <span className="drill-note">
                    {liveState(g) === 'live' ? 'Live' : formatTime(g.tip, tz)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="md-actions">
          <button className="chip" onClick={() => (onSchedule?.(abbr), onClose())}>
            📋 Full schedule
          </button>
        </div>
      </div>
    </div>
  )
}
