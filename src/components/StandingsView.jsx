import { Fragment, useMemo, useState } from 'react'
import { divisionStandings, conferenceSeeds } from '../utils/standings.js'
import { CONFERENCES, CONFERENCE_KEYS, DIVISION_ORDER, PLAYOFF } from '../config/league.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// PCT reads ".625" — three decimals, no leading zero (the standings convention).
const pct = (n) => n.toFixed(3).replace(/^0/, '')
// Point differential is a whole number here (PF − PA), not a per-game rate.
const signed = (n) => (n > 0 ? `+${n}` : String(n))
// A W-L-T record collapses to W-L when there are no ties — ties are rare enough that
// showing "-0" everywhere would be noise.
const rec = (r) => (r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`)

function StreakPill({ streak }) {
  // streak is +N (win run) / −N (loss run) / 0 (none, or the last game was a tie).
  if (!streak) return <span className="dim">—</span>
  const win = streak > 0
  return (
    <span className={`streak ${win ? 'streak-w' : 'streak-l'}`}>
      {win ? 'W' : 'L'}
      {Math.abs(streak)}
    </span>
  )
}

function Row({ row, rank, onPick }) {
  const { isFollowed, toggle } = useFollow()
  const followed = isFollowed(row.abbr)

  return (
    <tr className={followed ? 'row-followed' : ''}>
      <td className="col-rank">
        {/* Separate <td> from the team button below — a <button> may not nest a <button>. */}
        <button
          className={`star ${followed ? 'on' : ''}`}
          onClick={() => toggle(row.abbr)}
          aria-label={`${followed ? 'Unfollow' : 'Follow'} ${row.team.displayName}`}
          aria-pressed={followed}
        >
          ★
        </button>
        <span className="rank">{rank}</span>
      </td>
      <td className="col-team">
        <button className="team-btn" onClick={() => onPick?.(row.abbr)}>
          <TeamLogo abbr={row.abbr} size={26} />
          <span className="team-name">
            <span className="team-loc">{row.team.location}</span>{' '}
            <span className="team-nick">{row.team.name}</span>
          </span>
          {row.isDivisionWinner && (
            <span className="badge badge-in" title="Division leader — seeds 1–4 host a playoff game">
              ♛
            </span>
          )}
        </button>
      </td>
      <td className="num">{row.w}</td>
      <td className="num">{row.l}</td>
      <td className="num">{row.t}</td>
      <td className="num">{pct(row.pct)}</td>
      <td className="num hide-sm">{row.pf}</td>
      <td className="num hide-sm">{row.pa}</td>
      <td className={`num ${row.diff > 0 ? 'pos' : row.diff < 0 ? 'neg' : ''}`}>{signed(row.diff)}</td>
      <td className="num hide-sm">{rec(row.home)}</td>
      <td className="num hide-sm">{rec(row.road)}</td>
      <td className="num hide-sm">{rec(row.div)}</td>
      <td className="num">
        <StreakPill streak={row.streak} />
      </td>
    </tr>
  )
}

// 13 body columns — kept in sync with the colSpan on the cutline row.
const COLS = 13

function Table({ caption, rows, rankKey, onPick, cutAfter, cutLabel }) {
  return (
    <div className="card">
      <h3 className="card-title">{caption}</h3>
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="col-rank" />
              <th className="col-team">Team</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">T</th>
              <th className="num">PCT</th>
              <th className="num hide-sm">PF</th>
              <th className="num hide-sm">PA</th>
              <th className="num" title="Point differential (PF − PA)">Diff</th>
              <th className="num hide-sm">Home</th>
              <th className="num hide-sm">Road</th>
              <th className="num hide-sm" title="Record vs own division">Div</th>
              <th className="num">Strk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={row.abbr}>
                <Row row={row} rank={row[rankKey]} onPick={onPick} />
                {cutAfter === i + 1 && (
                  <tr className="cutline">
                    <td colSpan={COLS}>
                      <span>{cutLabel}</span>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StandingsView({ games, onPick }) {
  const [mode, setMode] = useState('division')
  const byDivision = useMemo(() => divisionStandings(games), [games])
  const byConference = useMemo(() => conferenceSeeds(games), [games])

  // Every team 0-0-0 until Week 1 — say so rather than showing eight tables of zeros
  // with no context.
  const anyPlayed = useMemo(
    () => Object.values(byDivision).some((rows) => rows.some((r) => r.gp > 0)),
    [byDivision]
  )

  const cutLabel = `Playoff cut — ${PLAYOFF.seedsPerConference} per conference: 4 division winners + 3 wild cards`

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Regular Season</h2>
          <p className="sub">
            The NFL takes <strong>seven teams per conference</strong>. The four division winners
            are seeds <strong>1–4</strong> and host a game; the next three by record are wild cards
            (<strong>5–7</strong>).
          </p>
        </div>
        <div className="seg">
          <button className={mode === 'division' ? 'on' : ''} onClick={() => setMode('division')}>
            By division
          </button>
          <button className={mode === 'conf' ? 'on' : ''} onClick={() => setMode('conf')}>
            By conference
          </button>
        </div>
      </div>

      {!anyPlayed && (
        <p className="empty">Standings begin in Week 1 — every team is 0-0-0 until kickoff.</p>
      )}

      {mode === 'division' ? (
        CONFERENCE_KEYS.map((conf) => (
          <div className="conf-group" key={conf}>
            <h3 className="conf-group-title">{CONFERENCES[conf]}</h3>
            <div className="grid-2">
              {DIVISION_ORDER.map((d) => {
                const div = `${conf} ${d}`
                return (
                  <Table
                    key={div}
                    caption={div}
                    rows={byDivision[div]}
                    rankKey="divRank"
                    onPick={onPick}
                  />
                )
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="grid-2">
          {CONFERENCE_KEYS.map((conf) => (
            <Table
              key={conf}
              caption={CONFERENCES[conf]}
              rows={byConference[conf]}
              rankKey="seed"
              onPick={onPick}
              cutAfter={PLAYOFF.seedsPerConference}
              cutLabel={cutLabel}
            />
          ))}
        </div>
      )}
    </section>
  )
}
