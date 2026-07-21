import { useMemo, useState } from 'react'
import { seasonTotals, teamScoring, leaderboard, LEADER_CATEGORIES } from '../utils/stats.js'
import { playoffPicture } from '../utils/standings.js'
import { CONFERENCES, CONFERENCE_KEYS } from '../config/league.js'
import { formatDate } from '../utils/time.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)
const wlt = (r) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`

// ── 1. Season totals ─────────────────────────────────────────────────────────
// Single headline numbers, so these are stat tiles rather than a chart. The three
// tiles with a story behind them expand into the actual games.

function Tile({ label, value, sub, title, onClick, open }) {
  const Cmp = onClick ? 'button' : 'div'
  return (
    <Cmp className={`tile ${onClick ? 'tile-btn' : ''} ${open ? 'open' : ''}`} onClick={onClick} title={title}>
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {sub && <span className="tile-sub">{sub}</span>}
      {onClick && <span className="tile-caret">{open ? '▾' : '▸'}</span>}
    </Cmp>
  )
}

// Score is stored [home, away]; the away team is shown on the left, matching "away @ home".
function GameList({ games, tz, note }) {
  return (
    <ul className="drill">
      {games.map((g) => (
        <li key={g.id}>
          <span className="drill-date">{formatDate(g.tip, tz)}</span>
          <TeamLogo abbr={g.away} size={18} />
          <span className="drill-score">
            {g.score[1]} – {g.score[0]}
          </span>
          <TeamLogo abbr={g.home} size={18} />
          <span className="drill-note">{note(g)}</span>
        </li>
      ))}
    </ul>
  )
}

function TotalsStrip({ games, tz }) {
  const t = useMemo(() => seasonTotals(games), [games])
  const [open, setOpen] = useState(null)
  const toggle = (k) => setOpen((v) => (v === k ? null : k))

  return (
    <div className="card">
      <h3 className="card-title">Season so far</h3>
      <div className="tiles">
        <Tile label="Games played" value={t.played} sub={`${t.remaining} to go`} />
        <Tile label="Total points" value={t.totalPoints.toLocaleString()} />
        <Tile label="Points per game" value={one(t.ppg)} sub="per team" />
        <Tile
          label="Home win rate"
          value={`${Math.round(t.homeWinPct * 100)}%`}
          sub={`${t.homeWins} of ${t.played}`}
        />
        <Tile
          label="One-score games"
          value={t.oneScore.length}
          sub="within 8"
          title="Decided by 8 points or fewer — a touchdown and a two-point conversion"
          onClick={() => toggle('close')}
          open={open === 'close'}
        />
        <Tile
          label="Overtime games"
          value={t.overtimes.length}
          onClick={() => toggle('ot')}
          open={open === 'ot'}
        />
        <Tile label="Ties" value={t.ties.length} onClick={() => toggle('ties')} open={open === 'ties'} />
      </div>

      {open === 'close' && (
        <GameList
          games={[...t.oneScore].sort((a, b) => a.margin - b.margin)}
          tz={tz}
          note={(g) => `by ${g.margin}`}
        />
      )}
      {open === 'ot' && <GameList games={t.overtimes} tz={tz} note={() => 'OT'} />}
      {open === 'ties' && <GameList games={t.ties} tz={tz} note={() => 'tie'} />}
    </div>
  )
}

// ── 2. League leaders ────────────────────────────────────────────────────────
// One ranked list per statistical category, grouped by the side of the ball it
// belongs to. Bars are a sequential fill with the value direct-labelled; ties share
// a rank (leaderboard() handles that).

const UNITS = [
  { key: 'passing', label: 'Passing' },
  { key: 'rushing', label: 'Rushing' },
  { key: 'receiving', label: 'Receiving' },
  { key: 'defense', label: 'Defense' },
]

function LeaderBoard({ cat, onPickTeam, onPickPlayer }) {
  const rows = useMemo(() => leaderboard(cat.key, { limit: 5 }), [cat.key])
  const max = rows[0]?.value || 1
  if (rows.length === 0) return null

  return (
    <div className="card">
      <h3 className="card-title">{cat.label}</h3>
      <table className="leaders">
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="lead-rank">{p.rank}</td>
              <td className="lead-team">
                <button onClick={() => onPickTeam?.(p.team)} title={p.team}>
                  <TeamLogo abbr={p.team} size={20} />
                </button>
              </td>
              <td className="lead-name">
                <button className="lead-player" onClick={() => onPickPlayer?.(p)}>
                  {p.name}
                </button>
                <span className="lead-pos">{p.pos}</span>
              </td>
              <td className="lead-bar">
                <span className="bar" style={{ '--w': `${(p.value / max) * 100}%` }} />
              </td>
              <td className="lead-value">{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Leaders({ onPickTeam, onPickPlayer }) {
  // PLAYERS is empty until the season starts, so leaderboard() returns [] for every
  // category. Show one honest line rather than four empty cards.
  const anyData = useMemo(() => LEADER_CATEGORIES.some((c) => leaderboard(c.key, { limit: 1 }).length > 0), [])

  if (!anyData) {
    return (
      <div className="card">
        <h3 className="card-title">League leaders</h3>
        <p className="empty">Leaders appear once the season starts.</p>
      </div>
    )
  }

  return (
    <div className="leaders-groups">
      {UNITS.map((u) => {
        const cats = LEADER_CATEGORIES.filter((c) => c.unit === u.key)
        return (
          <div className="conf-group" key={u.key}>
            <h3 className="conf-group-title">{u.label} leaders</h3>
            <div className="grid-2">
              {cats.map((c) => (
                <LeaderBoard key={c.key} cat={c} onPickTeam={onPickTeam} onPickPlayer={onPickPlayer} />
              ))}
            </div>
          </div>
        )
      })}
      <p className="fine">Qualified players only, per ESPN&apos;s minimums. Ties share a rank.</p>
    </div>
  )
}

// ── 3. Team scoring margin ───────────────────────────────────────────────────
// Point differential per game is a polarity measure, so it gets the validated
// diverging pair (blue positive / red negative) around a neutral zero line.
//
// Deliberately labelled "points per game" and not "efficiency" or "rating": those
// are per-possession measures, and the public feeds expose no possession counts.

function MarginChart({ games, onPickTeam }) {
  const rows = useMemo(() => teamScoring(games), [games])

  if (rows.length === 0) {
    return (
      <div className="card">
        <h3 className="card-title">Scoring margin — points per game</h3>
        <p className="empty">Season hasn&apos;t started — margins appear once games are played.</p>
      </div>
    )
  }

  const span = Math.max(...rows.map((r) => Math.abs(r.netPpg)), 1)

  return (
    <div className="card">
      <h3 className="card-title">Scoring margin — points per game</h3>
      <div className="margin" role="table" aria-label="Team scoring margin per game">
        {rows.map((r) => {
          const pos = r.netPpg >= 0
          // Each arm gets 40% of the track, leaving room for the direct label to sit
          // beyond the longest bar without colliding with the next column.
          const width = (Math.abs(r.netPpg) / span) * 40
          return (
            <div className="margin-row" key={r.abbr} role="row">
              <button className="margin-team" onClick={() => onPickTeam?.(r.abbr)} role="cell">
                <TeamLogo abbr={r.abbr} size={22} />
                <span>{r.team.name}</span>
              </button>
              {/* --w lives on the track so the bar AND its label can both read it. */}
              <div className="margin-track" role="cell" style={{ '--w': `${width}%` }}>
                <span className="margin-zero" />
                <span className={`margin-bar ${pos ? 'pos' : 'neg'}`} />
                <span className={`margin-label ${pos ? 'pos' : 'neg'}`}>
                  {pos ? '+' : '−'}
                  {one(Math.abs(r.netPpg))}
                </span>
              </div>
              <span className="margin-split" role="cell">
                <span title={`${one(r.ppg)} scored per game (rank ${r.offRank})`}>{one(r.ppg)}</span>
                <i>/</i>
                <span title={`${one(r.oppPpg)} allowed per game (rank ${r.defRank})`}>
                  {one(r.oppPpg)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <p className="fine">
        Bar length is net points per game; the right column is scored / allowed. Not
        possession-adjusted — the public feeds don&apos;t publish possession counts.
      </p>
    </div>
  )
}

// ── 4. Playoff race ──────────────────────────────────────────────────────────
// Status is carried by an icon + word, never by color alone.

const STATUS = {
  clinched: { icon: '✓', word: 'Clinched', cls: 'st-good' },
  eliminated: { icon: '✕', word: 'Eliminated', cls: 'st-out' },
  in: { icon: '●', word: 'In the field', cls: 'st-in' },
  chasing: { icon: '○', word: 'In the hunt', cls: 'st-chase' },
}

function statusOf(row) {
  if (row.clinched) return STATUS.clinched
  if (row.eliminated) return STATUS.eliminated
  return row.inField ? STATUS.in : STATUS.chasing
}

function ConferenceRace({ conf, rows, onPickTeam }) {
  return (
    <div className="card">
      <h3 className="card-title">{CONFERENCES[conf]}</h3>
      <p className="fine top">Top 7 in each conference reach the playoffs — 4 division winners plus 3 wild cards.</p>
      <div className="table-scroll">
        <table className="standings race">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Team</th>
              <th className="num">W-L-T</th>
              <th className="num" title="Games left to play">Left</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = statusOf(r)
              return (
                <tr key={r.abbr} className={r.eliminated ? 'row-elim' : ''}>
                  <td className="num dim">{r.seed}</td>
                  <td>
                    <button className="team-btn" onClick={() => onPickTeam?.(r.abbr)}>
                      <TeamLogo abbr={r.abbr} size={22} />
                      <span className="team-nick">{r.team.name}</span>
                    </button>
                  </td>
                  <td className="num">{wlt(r)}</td>
                  <td className="num dim">{r.remaining}</td>
                  <td>
                    <span className={`status ${st.cls}`}>
                      <i aria-hidden="true">{st.icon}</i> {st.word}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PlayoffRace({ games, onPickTeam }) {
  const picture = useMemo(() => playoffPicture(games), [games])
  return (
    <div className="grid-2">
      {CONFERENCE_KEYS.map((conf) => (
        <ConferenceRace key={conf} conf={conf} rows={picture[conf]} onPickTeam={onPickTeam} />
      ))}
    </div>
  )
}

export default function StatsView({ games, tz, onPickTeam, onPickPlayer }) {
  return (
    <section className="view">
      <div className="view-head">
        <h2>Stats</h2>
      </div>
      <TotalsStrip games={games} tz={tz} />
      <Leaders onPickTeam={onPickTeam} onPickPlayer={onPickPlayer} />
      <MarginChart games={games} onPickTeam={onPickTeam} />
      <PlayoffRace games={games} onPickTeam={onPickTeam} />
    </section>
  )
}
