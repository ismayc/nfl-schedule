import { useMemo } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { LEAGUE, PLAYOFF } from '../config/league.js'
import { formatDate, formatTime, formatZoneAbbr, liveState, countdown } from '../utils/time.js'
import { computeStandings, countsForStandings } from '../utils/standings.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => (n ?? 0).toFixed(1)

// W–L, with a trailing tie count only when there is one. Ties are the NFL's defining
// structural quirk (config: standingsModel 'winlosstie'), so a record can be three parts.
const rec = (r) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ''}`

// Wins–losses(–ties) over a team's most recent five results.
const last5Line = (r) => {
  const c = (x) => r.last5.filter((v) => v === x).length
  const w = c('w')
  const l = c('l')
  const t = c('t')
  return t ? `${w}–${l}–${t}` : `${w}–${l}`
}

const roundName = (key) => PLAYOFF.rounds.find((r) => r.key === key)?.name

// Season series between these two, so the detail answers "who's had the better of
// this matchup" without a trip to the schedule. Unlike the WNBA original, a meeting can
// end in a tie, so the head-to-head is wins–wins(–ties), not a clean win count.
function useSeries(games, a, b) {
  return useMemo(() => {
    if (!a || !b) return { met: [], wins: { [a]: 0, [b]: 0 }, ties: 0 }
    const met = games.filter(
      (g) => countsForStandings(g) && [g.home, g.away].includes(a) && [g.home, g.away].includes(b)
    )
    const wins = { [a]: 0, [b]: 0 }
    let ties = 0
    for (const g of met) {
      const [hs, as] = g.score
      if (hs === as) {
        ties++
        continue
      }
      wins[hs > as ? g.home : g.away]++
    }
    return { met, wins, ties }
  }, [games, a, b])
}

// Football's answer to a play-by-play. Individual plays are too numerous to enumerate,
// but the quarter breakdown carries the shape of the game — "won by 8" and "led by 20 and
// held on" look identical in a final score. MAY be undefined for an unplayed game.
function LineScore({ game, hideScores }) {
  if (!game.line || hideScores) return null

  const { home, away } = game.line
  const periods = Math.max(home.length, away.length)
  if (!periods) return null

  // Q1–Q4 from config, then OT (numbered if more than one overtime, though the NFL plays
  // at most one in the regular season).
  const reg = LEAGUE.regulationPeriods
  const label = (i) =>
    i < reg
      ? `${LEAGUE.periodShort}${i + 1}`
      : periods - reg > 1
        ? `${LEAGUE.overtimeLabel}${i - reg + 1}`
        : LEAGUE.overtimeLabel
  const sum = (arr) => arr.reduce((a, b) => a + b, 0)

  const Row = ({ abbr, vals, total }) => (
    <tr>
      <th scope="row">
        <TeamLogo abbr={abbr} size={18} />
        <span>{abbr}</span>
      </th>
      {Array.from({ length: periods }, (_, i) => {
        const mine = vals[i]
        const theirs = (abbr === game.home ? away : home)[i]
        // Bolding the higher number per quarter turns the row into a momentum read.
        const won = mine != null && theirs != null && mine > theirs
        return (
          <td key={i} className={won ? 'q-won' : ''}>
            {mine ?? '–'}
          </td>
        )
      })}
      <td className="q-total">{total}</td>
    </tr>
  )

  return (
    <>
      <h4 className="md-sub">By quarter</h4>
      <div className="table-scroll">
        <table className="linescore">
          <thead>
            <tr>
              <th />
              {Array.from({ length: periods }, (_, i) => (
                <th key={i}>{label(i)}</th>
              ))}
              <th className="q-total">T</th>
            </tr>
          </thead>
          <tbody>
            <Row abbr={game.away} vals={away} total={sum(away)} />
            <Row abbr={game.home} vals={home} total={sum(home)} />
          </tbody>
        </table>
      </div>
    </>
  )
}

// The feeds expose only these three yardage leaders per game — no possession-level detail
// to invent from (house rule: name things literally). MAY be undefined for an unplayed game.
const CAT_LABEL = { passingYards: 'PASS', rushingYards: 'RUSH', receivingYards: 'REC' }

function GameLeaders({ game }) {
  if (!(game.stars?.length > 0)) return null
  const byTeam = [game.away, game.home].map((abbr) => ({
    abbr,
    rows: game.stars.filter((s) => s.team === abbr),
  }))
  if (!byTeam.some((t) => t.rows.length > 0)) return null

  return (
    <>
      <h4 className="md-sub">Game leaders</h4>
      <div className="leaders-split">
        {byTeam.map(({ abbr, rows }) => (
          <div key={abbr} className="gl-team">
            <div className="gl-head">
              <TeamLogo abbr={abbr} size={18} />
              <span>{abbr}</span>
            </div>
            {rows.map((s) => (
              <div className="gl-row" key={s.cat}>
                <span className="gl-cat">{CAT_LABEL[s.cat] || s.cat}</span>
                <span className="gl-who">{s.who}</span>
                <span className="gl-v">{s.v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function TaleRow({ label, left, right, betterLeft }) {
  return (
    <div className="tale-row">
      <span className={`tale-val ${betterLeft === true ? 'better' : ''}`}>{left}</span>
      <span className="tale-label">{label}</span>
      <span className={`tale-val ${betterLeft === false ? 'better' : ''}`}>{right}</span>
    </div>
  )
}

export default function GameDetail({ game, games, tz, hideScores, onClose, onPickTeam }) {
  const ref = useModalA11y(onClose, !!game)
  const table = useMemo(() => computeStandings(games), [games])
  const series = useSeries(games, game?.away, game?.home)

  if (!game) return null

  const away = TEAM_BY_ABBR[game.away]
  const home = TEAM_BY_ABBR[game.home]
  // computeStandings returns a blank record for every team, so these are always defined —
  // in the empty 2026 snapshot they are simply all zeros.
  const A = table[game.away]
  const H = table[game.home]
  const state = liveState(game)
  const scored = game.score && !hideScores
  const [hs, as] = game.score || []
  const isPost = game.seasonType === 'postseason'

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Game detail" ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="md-head">
          <div className="md-side">
            <TeamLogo abbr={game.away} size={52} />
            <strong>{away?.displayName}</strong>
            <span className="dim">{rec(A)}</span>
          </div>
          <div className="md-center">
            {scored ? (
              <>
                <span className="md-score">
                  {as} – {hs}
                </span>
                <span className="md-state">
                  {state === 'live'
                    ? game.statusLabel || 'Live'
                    : `Final${game.ot ? (game.ot > 1 ? `/${game.ot}OT` : '/OT') : ''}`}
                </span>
              </>
            ) : (
              <>
                <span className="md-time">{formatTime(game.tip, tz)}</span>
                <span className="md-state">{formatZoneAbbr(game.tip, tz)}</span>
                {countdown(game.tip) && <span className="md-state">in {countdown(game.tip)}</span>}
              </>
            )}
          </div>
          <div className="md-side">
            <TeamLogo abbr={game.home} size={52} />
            <strong>{home?.displayName}</strong>
            <span className="dim">{rec(H)}</span>
          </div>
        </div>

        <dl className="md-facts">
          <div>
            <dt>{isPost ? 'Round' : 'Week'}</dt>
            <dd>{isPost ? roundName(game.round) || 'Postseason' : `Week ${game.week}`}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDate(game.tip, tz, { year: 'numeric' })}</dd>
          </div>
          {game.venue && (
            <div>
              <dt>Venue</dt>
              <dd>
                {game.venue}
                {game.city ? `, ${game.city}` : ''}
                {game.state ? `, ${game.state}` : ''}
              </dd>
            </div>
          )}
          {game.broadcast?.length > 0 && (
            <div>
              <dt>Watch</dt>
              <dd>{game.broadcast.join(' · ')}</dd>
            </div>
          )}
          {game.note && (
            <div>
              <dt>Note</dt>
              <dd className="note">{game.note}</dd>
            </div>
          )}
        </dl>

        <LineScore game={game} hideScores={hideScores} />
        <GameLeaders game={game} />

        <h4 className="md-sub">Tale of the tape</h4>
        <div className="tale">
          <TaleRow
            label="Record"
            left={rec(A)}
            right={rec(H)}
            betterLeft={A.pct === H.pct ? null : A.pct > H.pct}
          />
          <TaleRow
            label="Points per game"
            left={one(A.ppg)}
            right={one(H.ppg)}
            betterLeft={A.ppg === H.ppg ? null : A.ppg > H.ppg}
          />
          <TaleRow
            label="Allowed per game"
            left={one(A.oppPpg)}
            right={one(H.oppPpg)}
            betterLeft={A.oppPpg === H.oppPpg ? null : A.oppPpg < H.oppPpg}
          />
          <TaleRow
            label="Point differential"
            left={A.diff > 0 ? `+${A.diff}` : `${A.diff}`}
            right={H.diff > 0 ? `+${H.diff}` : `${H.diff}`}
            betterLeft={A.diff === H.diff ? null : A.diff > H.diff}
          />
          <TaleRow label="Last 5" left={last5Line(A)} right={last5Line(H)} />
        </div>

        {series.met.length > 0 && (
          <>
            <h4 className="md-sub">
              Season series — {series.wins[game.away]}–{series.wins[game.home]}
              {series.ties ? `–${series.ties}` : ''}
            </h4>
            <ul className="drill">
              {series.met.map((g) => (
                <li key={g.id}>
                  <span className="drill-date">{formatDate(g.tip, tz)}</span>
                  <span className="dim">
                    {g.away} {LEAGUE.homeAwaySep} {g.home}
                  </span>
                  <span className="drill-score">
                    {hideScores ? '—' : `${g.score[1]} – ${g.score[0]}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="md-actions">
          <button className="chip" onClick={() => (onPickTeam?.(game.away), onClose())}>
            <TeamLogo abbr={game.away} size={16} /> {away?.name} schedule
          </button>
          <button className="chip" onClick={() => (onPickTeam?.(game.home), onClose())}>
            <TeamLogo abbr={game.home} size={16} /> {home?.name} schedule
          </button>
        </div>
      </div>
    </div>
  )
}
