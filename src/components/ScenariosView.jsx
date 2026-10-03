import { Fragment, useMemo, useState } from 'react'
import { computeStandings, countsForStandings } from '../utils/standings.js'
import {
  OUT,
  MAX_OPEN_GAMES,
  BUDGET_MS,
  enumerateScenarios,
  favoritePicks,
  meanSeed,
  combinations,
  describeResult,
  rowPercents,
  rankScenario,
  conferenceOf,
} from '../utils/scenarios.js'
import { CONFERENCE_KEYS, PLAYOFF } from '../config/league.js'
import { formatDate, gameTime } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'

const FIELD = PLAYOFF.seedsPerConference
const WINNERS = PLAYOFF.divisionWinnerSeeds
const SEEDS = Array.from({ length: OUT }, (_, i) => i + 1)
// A cell lists at most this many result combinations, then sums up the rest.
const MAX_COMBOS = 6
const seedName = (s) => (s === OUT ? 'out of the playoffs' : `the ${s} seed`)
// A share that rounds to 0% is still possible, so it reads "<1%" rather than nothing.
const share = (pct) => (pct ? `${pct}%` : '<1%')
const n = (x) => x.toLocaleString('en-US')

// One open game: pick the away team, a tie, or the home team; tap the pick again to leave
// the game open.
function GameRow({ game, pick, onPick, tz }) {
  const button = (side) => {
    const on = pick === side
    const abbr = side === 'home' ? game.home : game.away
    const label =
      side === 'tie' ? `${game.away} and ${game.home} tie` : `${TEAM_BY_ABBR[abbr].displayName} win`
    return (
      <button
        className={`sc-team ${side === 'tie' ? 'sc-tie' : ''} ${on ? 'on' : ''} ${pick && !on ? 'lost' : ''}`}
        aria-pressed={on}
        aria-label={label}
        onClick={() => onPick(game.id, on ? null : side)}
      >
        {side === 'tie' ? (
          'Tie'
        ) : (
          <>
            <TeamLogo abbr={abbr} size={22} />
            <span>{abbr}</span>
          </>
        )}
      </button>
    )
  }
  return (
    <li className="sc-game">
      <span className="sc-when">
        {formatDate(game.tip, tz)} · {game.live ? <span className="sc-live">Live</span> : gameTime(game, tz)}
      </span>
      <span className="sc-pick">
        {button('away')}
        {button('tie')}
        {button('home')}
      </span>
    </li>
  )
}

// The open games, one block per week, so a season-long list stays navigable.
function GamesCard({ open, picks, onPick, tz }) {
  const weeks = []
  for (const g of open) {
    const last = weeks[weeks.length - 1]
    if (last && last.week === g.week) last.games.push(g)
    else weeks.push({ week: g.week, games: [g] })
  }
  const nPicked = open.filter((g) => picks[g.id]).length
  return (
    <div className="card">
      <h3 className="card-title">
        Games left · {nPicked} of {open.length} picked
      </h3>
      {weeks.map(({ week, games }, i) => (
        <details key={`${week}-${i}`} className="sc-week" open={i === 0}>
          <summary>
            Week {week}
            <span className="dim">
              {' '}
              · {games.filter((g) => picks[g.id]).length} of {games.length} picked
            </span>
          </summary>
          <ul className="sc-games">
            {games.map((g) => (
              <GameRow key={g.id} game={g} pick={picks[g.id]} onPick={onPick} tz={tz} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

// Race marks for one grid row, from the SAME counts the cells show: in the top 4 in every
// outcome (a division title), in the field in every outcome, or out in every one.
function marksFor(team, total) {
  const reach = (s) => team[s].count + team[s].maybe
  const outside = (from) => SEEDS.filter((s) => s >= from).some((s) => reach(s) > 0)
  return {
    division: !outside(WINNERS + 1),
    clinched: !outside(OUT),
    eliminated: team[OUT].count === total,
  }
}

// `detail` (what a tapped cell takes) opens as a row right under that team's row, so it
// appears where the tap was (the WNBA fix for a breakdown that rendered off screen).
function Matrix({ result, conf, selected, onSelect, onPickTeam, detail }) {
  const { isFollowed } = useFollow()
  const order = Object.keys(result.teams)
    .filter((abbr) => conferenceOf(abbr) === conf)
    .sort((a, b) => meanSeed(result.teams[a]) - meanSeed(result.teams[b]) || a.localeCompare(b))
  return (
    <div className="table-scroll">
      <table className="standings sc-matrix">
        <thead>
          <tr>
            <th className="col-team">Team</th>
            {SEEDS.map((s) => (
              <th
                key={s}
                className={`num ${s === OUT ? 'sc-out-col' : ''} ${s === WINNERS + 1 ? 'sc-wc-col' : ''}`}
                title={s === OUT ? 'Out of the playoffs' : s <= WINNERS ? 'Division winner seed' : 'Wild card seed'}
              >
                {s === OUT ? 'Out' : s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((abbr, row) => {
            const team = result.teams[abbr]
            const { division, clinched, eliminated } = marksFor(team, result.total)
            const percents = rowPercents(team, result.total)
            return (
              <Fragment key={abbr}>
                <tr className={`${isFollowed(abbr) ? 'row-followed' : ''} ${eliminated ? 'row-elim' : ''}`}>
                  <td className="col-team">
                    <button
                      className="team-btn"
                      aria-label={`${abbr}${division ? ', clinched the division' : clinched ? ', clinched a playoff berth' : ''}${eliminated ? ', eliminated' : ''}`}
                      onClick={() => onPickTeam?.(abbr)}
                    >
                      <TeamLogo abbr={abbr} size={22} />
                      <span className="team-nick">{abbr}</span>
                      {division && (
                        <span className="badge badge-in hide-sm" title="Wins the division in every outcome">
                          ✓ div
                        </span>
                      )}
                      {clinched && !division && (
                        <span className="badge badge-in hide-sm" title="In the playoffs in every outcome">
                          ✓
                        </span>
                      )}
                      {eliminated && (
                        <span className="badge badge-out hide-sm" title="Out of the playoffs in every outcome">
                          ✕
                        </span>
                      )}
                    </button>
                  </td>
                  {SEEDS.map((s) => {
                    const { count, maybe } = team[s]
                    const on = selected?.abbr === abbr && selected.seed === s
                    const locked = count === result.total
                    // A lock on "Out" is elimination, not an achievement: an ✕, not a ✓.
                    const mark = s === OUT ? '✕' : '✓'
                    const text = locked ? mark : count ? share(percents[s]) : ''
                    return (
                      <td
                        key={s}
                        className={`num sc-cell-td ${s === OUT ? 'sc-out-col' : ''} ${s === WINNERS + 1 ? 'sc-wc-col' : ''}`}
                      >
                        <button
                          className={`sc-cell ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${s === OUT ? 'out' : ''}`}
                          style={{ '--share': (count + maybe / 2) / result.total }}
                          disabled={!count && !maybe}
                          aria-pressed={on}
                          aria-label={`${abbr} ${seedName(s)}: ${count} of ${result.total} outcomes${
                            maybe ? `, ${maybe} more depending on points` : ''
                          }`}
                          onClick={() => onSelect(on ? null : { abbr, seed: s })}
                        >
                          {text}
                          {maybe > 0 && <sup>*</sup>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
                {selected?.abbr === abbr && (
                  <tr className="sc-detail-row">
                    <td colSpan={SEEDS.length + 1}>{detail}</td>
                  </tr>
                )}
                {row + 1 === FIELD && (
                  <tr className="cutline">
                    <td colSpan={SEEDS.length + 1}>
                      <span>Playoff line: top {FIELD} make the postseason</span>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Which tiebreak steps helped place the team, in how many of the outcomes.
function Tiebreaks({ tally, of }) {
  const steps = Object.keys(tally).sort()
  if (!steps.length) return null
  return (
    <>
      <p className="sc-path-sub">Tiebreakers that help decide it:</p>
      <ul className="sc-ties">
        {steps.map((step) => (
          <li key={step}>
            {step}: in {n(tally[step])} of {n(of)}
          </li>
        ))}
      </ul>
    </>
  )
}

// What it takes for one team to land in one seed bucket. Exported for its own test: no
// real board reached here holds a cell with more than MAX_COMBOS combinations.
export function Path({ result, selected, picks, onApply }) {
  const { abbr, seed } = selected
  const cell = result.teams[abbr][seed]
  const team = TEAM_BY_ABBR[abbr]
  const possible = cell.count + cell.maybe
  const locked = cell.count === result.total
  const combos = combinations(cell.scenarios, result.undecided)
  const shown = combos.slice(0, MAX_COMBOS)
  const hidden = combos.slice(MAX_COMBOS)
  // A "beats or ties" line books its first outcome (the win), which stays inside it.
  const apply = (results) => {
    const next = { ...picks }
    for (const { game, sides } of results) next[game.id] = sides[0]
    onApply(next)
  }
  return (
    <div className="sc-path">
      <p className="sc-path-lead">
        {locked ? (
          <>
            <strong>Locked.</strong> The {team.name} finish as {seedName(seed)} in every remaining
            outcome.
          </>
        ) : cell.count ? (
          <>
            The {team.name} finish as {seedName(seed)} in <strong>{n(cell.count)}</strong> of{' '}
            {n(result.total)} outcomes{combos.length > 1 ? ', when:' : ', when'}
          </>
        ) : (
          <>
            The {team.name} can finish as {seedName(seed)} only if the points tiebreakers fall
            their way, in <strong>{n(cell.maybe)}</strong> of {n(result.total)} outcomes.
          </>
        )}
      </p>
      {!locked && shown.length > 0 && (
        <ul className="sc-combos">
          {shown.map(({ results, count }) => (
            <li key={results.map((r) => r.game.id + r.sides.join('')).join()}>
              <button
                className="sc-combo"
                aria-label={`Pick ${results.map(({ game, sides }) => describeResult(game, sides)).join(', ')}`}
                onClick={() => apply(results)}
              >
                <span className="sc-combo-results">
                  {results.map(({ game, sides }, i) => (
                    <span key={game.id}>
                      {i > 0 && <span className="dim"> + </span>}
                      {describeResult(game, sides)}
                    </span>
                  ))}
                </span>
                <span className="sc-combo-count">{n(count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <p className="sc-path-sub">
          + {hidden.length} more combinations ({n(hidden.reduce((t, c) => t + c.count, 0))} outcomes)
        </p>
      )}
      {!locked && shown.length > 0 && (
        <p className="sc-path-sub">
          {combos.length > 1 ? 'Each line lists' : 'Those are'} the only results that matter; the
          other games can go any way. Tap a line to pick it (a &ldquo;beats or ties&rdquo; line
          picks the win).
        </p>
      )}
      {cell.maybe > 0 && (
        <p className="sc-path-sub sc-margin">
          {cell.count
            ? `In ${n(cell.maybe)} more outcomes they might, depending on points.`
            : 'That depends on points.'}{' '}
          A tie there gets past strength of schedule to the points tiebreakers, and a picked game
          has no score, so every club still tied at that step is counted as possibly coming out
          ahead.
        </p>
      )}
      <Tiebreaks tally={cell.tiebreaks} of={possible} />
    </div>
  )
}

// A fully decided season: the exact seeding for one conference, how its ties broke, and
// the Wild Card round.
function Final({ scenario, complete, onPickTeam }) {
  const { rows, trace, positions, scoreless, scoreDependent, overflow } = scenario
  const seedOf = Object.fromEntries(rows.map((r, i) => [r.abbr, i + 1]))
  const range = (abbr) => {
    const p = [...positions[abbr]]
    return [Math.min(...p), Math.max(...p)]
  }
  // Only the ties that touch the field (and the first team out) are listed.
  const ties = trace.filter((t) => t.teams.some((a) => seedOf[a] <= FIELD + 1))
  const bySeed = (s) => rows[s - 1]
  return (
    <div className="card">
      <h3 className="card-title">{complete ? 'Final seeding' : 'Seeding with your picks'}</h3>
      <ol className="sc-final">
        {rows.map((row, i) => {
          const [lo, hi] = range(row.abbr)
          return (
            <li key={row.abbr} className={i < FIELD ? '' : 'sc-final-out'}>
              <span className="rank" title={lo === hi ? undefined : 'Depends on points'}>
                {lo === hi ? i + 1 : `${lo}–${hi}`}
              </span>
              <button className="team-btn" onClick={() => onPickTeam?.(row.abbr)}>
                <TeamLogo abbr={row.abbr} size={22} />
                <span className="team-name">
                  <span className="team-loc">{row.team.location}</span>{' '}
                  <span className="team-nick">{row.team.name}</span>
                </span>
                {row.isDivisionWinner && (
                  <span className="badge badge-in" title="Division winner">
                    div
                  </span>
                )}
              </button>
              <span className="num dim">
                {row.t ? `${row.w}-${row.l}-${row.t}` : `${row.w}-${row.l}`}
              </span>
            </li>
          )
        })}
      </ol>
      {ties.length > 0 && (
        <>
          <p className="sc-path-sub">Tiebreakers:</p>
          <ul className="sc-ties">
            {ties.map((t, i) => (
              <li key={i}>
                {t.teams.join(' / ')}: {t.step}
                {scoreless && t.scores && (
                  <span className="sc-margin"> (points: no pick can settle this)</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {scoreDependent && (
        <p className="sc-path-sub sc-margin">
          {overflow
            ? 'So many ties reach the points tiebreakers here that not every order was played out; every place is shown as open.'
            : 'A picked game has no score, and points decide a tie here. A place shown as a range could land anywhere in it. The list and the Wild Card round below show one of those orders.'}
        </p>
      )}
      <p className="sc-path-sub">Wild Card round:</p>
      <ul className="sc-matchups">
        <li>
          <span className="rank">1</span> <TeamLogo abbr={bySeed(1).abbr} size={18} /> {bySeed(1).abbr}
          <span className="dim"> has the bye</span>
        </li>
        {PLAYOFF.wildCardPairs.map(([hi, lo]) => (
          <li key={hi}>
            <span className="rank">{hi}</span> <TeamLogo abbr={bySeed(hi).abbr} size={18} />{' '}
            {bySeed(hi).abbr}
            <span className="dim"> vs </span>
            <span className="rank">{lo}</span> <TeamLogo abbr={bySeed(lo).abbr} size={18} />{' '}
            {bySeed(lo).abbr}
          </li>
        ))}
      </ul>
    </div>
  )
}

// The legend names only the marks this grid is actually showing.
function Legend({ result, conf }) {
  let lock = false
  let elim = false
  let star = false
  let div = false
  let berth = false
  for (const [abbr, team] of Object.entries(result.teams)) {
    if (conferenceOf(abbr) !== conf) continue
    const m = marksFor(team, result.total)
    div ||= m.division
    berth ||= m.clinched && !m.division
    elim ||= m.eliminated
    for (const s of SEEDS) {
      lock ||= s !== OUT && team[s].count === result.total
      star ||= team[s].maybe > 0
    }
  }
  return (
    <p className="legend">
      <span className="legend-item">
        Each cell is the share of the {n(result.total)} ways the open games can go (a win, a loss, or
        a tie each), not a win probability.
        {star ? ' A row adds up to 100% apart from outcomes marked *.' : ' Each row adds up to 100%.'}{' '}
        Teams are ordered by their average finish, so the playoff line falls after the best {FIELD}.
        Seeds 1 to {WINNERS} go to division winners. The marks below follow your picks; the
        Standings tab shows what is clinched for real.
      </span>
      {lock && <span className="legend-item">✓ in a seed column: that seed is locked.</span>}
      {div && <span className="legend-item">✓ div: wins the division in every outcome.</span>}
      {berth && <span className="legend-item">✓: in the playoffs in every outcome.</span>}
      {elim && <span className="legend-item">✕: out of the playoffs in every outcome.</span>}
      {star && (
        <span className="legend-item">
          *: also possible in some outcomes if the points tiebreakers fall that way (a picked game
          has no score).
        </span>
      )}
    </p>
  )
}

export default function ScenariosView({ games, tz, onPick }) {
  const [rawPicks, setPicks] = useState({})
  const [selected, setSelected] = useState(null)
  const [conf, setConf] = useState(CONFERENCE_KEYS[0])

  const result = useMemo(() => enumerateScenarios(games, rawPicks), [games, rawPicks])
  const { open, undecided } = result
  // Picks for games that have since gone final drop out on their own.
  const picks = useMemo(
    () => Object.fromEntries(open.filter((g) => rawPicks[g.id]).map((g) => [g.id, rawPicks[g.id]])),
    [open, rawPicks]
  )
  const scenario = useMemo(
    () => (undecided.length ? null : rankScenario(games, picks)),
    [games, picks, undecided.length]
  )

  const pickGame = (id, side) =>
    setPicks((cur) => {
      const next = { ...cur }
      if (side) next[id] = side
      else delete next[id]
      return next
    })
  const favorites = () =>
    setPicks(favoritePicks(open, computeStandings(games.filter(countsForStandings))))
  const pickConf = (c) => (setConf(c), setSelected(null))

  const nPicked = open.length - undecided.length

  const results = result.tooMany ? (
    <div className="card">
      <h3 className="card-title">Where every team can finish</h3>
      <p className="sc-path-sub">
        {undecided.length} games are still open, too many to play out every combination: each
        one can end three ways, so even {MAX_OPEN_GAMES} open games make{' '}
        {n(3 ** MAX_OPEN_GAMES)} complete seasons. Pick {undecided.length - MAX_OPEN_GAMES} more
        (or tap Favorites win, then clear the games you want left open) to see the grid.
      </p>
      <p className="sc-path-sub">
        Games in the other conference count too: strength of victory and strength of schedule
        reach across the whole league.
      </p>
    </div>
  ) : result.tooSlow ? (
    <div className="card">
      <h3 className="card-title">Where every team can finish</h3>
      <p className="sc-path-sub">
        With these picks, playing out all {n(result.total)} outcomes took longer than{' '}
        {BUDGET_MS} ms, so it stopped rather than freeze the page. That happens when many
        records end level and the ties run deep into the tiebreakers. Pick another game or two,
        or change a pick, to see the grid.
      </p>
    </div>
  ) : scenario ? (
    <Final scenario={scenario[conf]} onPickTeam={onPick} />
  ) : (
    <div className="card">
      <h3 className="card-title">
        {conf} · where every team can finish · {n(result.total)} outcomes
      </h3>
      <Matrix
        result={result}
        conf={conf}
        selected={selected}
        onSelect={setSelected}
        onPickTeam={onPick}
        detail={
          selected && (
            <Path
              result={result}
              selected={selected}
              picks={picks}
              onApply={(next) => (setPicks(next), setSelected(null))}
            />
          )
        }
      />
      <Legend result={result} conf={conf} />
    </div>
  )

  return (
    <section className="view scenarios">
      <div className="view-head">
        <div>
          <h2>Scenarios</h2>
          <p className="sub">
            Pick results for the games that are left. Every combination of the rest (a win, a
            loss, or a tie) is played out under the official tiebreakers, so the grid shows each
            seed a team can still reach. Tap a cell to see exactly what it takes.
          </p>
        </div>
        <div className="sc-toolbar">
          <div className="seg" role="group" aria-label="Conference">
            {CONFERENCE_KEYS.map((c) => (
              <button key={c} className={conf === c ? 'on' : ''} aria-pressed={conf === c} onClick={() => pickConf(c)}>
                {c}
              </button>
            ))}
          </div>
          {open.length > 0 && (
            <>
              <button className="chip" onClick={favorites}>
                Favorites win
              </button>
              <button className="chip" disabled={!nPicked} onClick={() => setPicks({})}>
                Clear picks
              </button>
            </>
          )}
        </div>
      </div>

      {open.length === 0 ? (
        <>
          <p className="empty">The regular season is complete, so the seeds are final.</p>
          <Final scenario={scenario[conf]} complete onPickTeam={onPick} />
        </>
      ) : (
        <div className="grid-2 sc-layout">
          <div>{results}</div>
          <GamesCard open={open} picks={picks} onPick={pickGame} tz={tz} />
        </div>
      )}
    </section>
  )
}
