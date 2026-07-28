import { useMemo, useState } from 'react'
import { HISTORY, HISTORY_BY_YEAR, HISTORY_YEARS } from '../data/history.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { CONFERENCES, CONFERENCE_KEYS, LEAGUE } from '../config/league.js'
import { superBowlSummary, superBowlRuns, bestRecord, seedOf } from '../utils/history.js'
import { seasonScoring } from '../utils/stats.js'
import { BracketBody } from './Bracket.jsx'
import { Tile, GameList, Leaders, MarginChart } from './StatsView.jsx'
import TeamLogo from './TeamLogo.jsx'

/**
 * Completed seasons, back to 2021.
 *
 * The floor is set by two format changes that have to line up for seasons to be
 * comparable: the playoffs went to 14 teams in 2020 (seven seeds a conference, only the
 * 1 seed on a bye, re-seeded every round — the bracket this app models), and the regular
 * season went to 17 games in 2021. 2021 is where both are true, so every archived season
 * is directly comparable with the one the app is showing.
 *
 * Each season commits its final conference standings, its 13 postseason games, its
 * season totals and its leader boards. The bracket is rebuilt from those games at runtime
 * by the same buildBracket() the live season uses, so an archived bracket cannot drift
 * from the live one. The ~272 regular-season games are summarised into the standings
 * rather than committed.
 */

const MODES = [
  { key: 'season', label: 'By season' },
  { key: 'stats', label: 'Stats' },
  { key: 'champions', label: 'Super Bowls' },
]

// The two modes that show ONE season, and so want the season picker above them.
const SEASON_SCOPED = new Set(['season', 'stats'])

const teamName = (abbr) => TEAM_BY_ABBR[abbr].name

const pct = (n) => n.toFixed(3).replace(/^0/, '')
const signed = (n) => (n > 0 ? `+${n}` : String(n))
// W-L-T, with the tie dropped when there wasn't one — the NFL writes 12-5, not 12-5-0.
const record = ([w, l, t]) => (t ? `${w}-${l}-${t}` : `${w}-${l}`)
const teamRecord = (r) => record([r.w, r.l, r.t])

function TeamChip({ abbr, size = 22, onPick }) {
  return (
    <button className="hy-team" onClick={() => onPick?.(abbr)}>
      <TeamLogo abbr={abbr} size={size} />
      <span>{teamName(abbr)}</span>
    </button>
  )
}

/* ── One season's final conference tables ──────────────────────────────── */

// A finished season has no clinch/elimination story left, so this is a leaner table than
// the live Standings view rather than a reuse of it — but it keeps the seed column,
// which is what the bracket above was built from.
function StandingsTable({ conf, rows, onPick }) {
  return (
    <div className="card">
      <h3 className="card-title">{CONFERENCES[conf]}</h3>
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-team">Team</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">T</th>
              <th className="num">PCT</th>
              <th className="num hide-sm">PF</th>
              <th className="num hide-sm">PA</th>
              <th className="num">Diff</th>
              <th className="num hide-sm">Div</th>
              <th className="hide-sm">Seed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.abbr} className={r.inField ? '' : 'row-elim'}>
                <td className="col-rank">
                  <span className="rank">{r.seed}</span>
                </td>
                <td className="col-team">
                  <TeamChip abbr={r.abbr} size={24} onPick={onPick} />
                </td>
                <td className="num">{r.w}</td>
                <td className="num">{r.l}</td>
                <td className="num">{r.t}</td>
                <td className="num">{pct(r.pct)}</td>
                <td className="num hide-sm">{r.pf}</td>
                <td className="num hide-sm">{r.pa}</td>
                <td className={`num ${r.diff > 0 ? 'pos' : 'neg'}`}>{signed(r.diff)}</td>
                <td className="num hide-sm">{record(r.div)}</td>
                <td className="hide-sm dim">
                  {r.inField ? (r.seedType === 'division' ? 'Division' : 'Wild card') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── One season ────────────────────────────────────────────────────────── */

// One archived season: the bracket (which carries its own champion banner) and the two
// final conference tables it was seeded from.
function Season({ season, tz, onPick, onOpen }) {
  const sb = useMemo(() => superBowlSummary(season), [season])

  return (
    <>
      <p className="sub hy-note">
        The <strong>{ordinal(seedOf(season, sb.winner))} seed</strong> beat the{' '}
        {ordinal(seedOf(season, sb.loser))} — {teamName(sb.winner)} over{' '}
        {teamName(sb.loser)}.
      </p>

      <BracketBody
        games={season.games}
        seeds={season.standings}
        tz={tz}
        onPick={onPick}
        onOpen={onOpen}
      />

      <div className="conf-groups">
        {CONFERENCE_KEYS.map((c) => (
          <StandingsTable key={c} conf={c} rows={season.standings[c]} onPick={onPick} />
        ))}
      </div>
    </>
  )
}

// Playoff seeds only ever run 1–7, so this needs no teen rule and no arithmetic.
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th']
const ordinal = (seed) => ORDINALS[seed - 1]

/* ── One season's statistics ───────────────────────────────────────────── */

// The live Stats view's cards, driven by an archived season instead of a game list: the
// totals it derived from ~272 games are committed as numbers, the leaderboards were built
// by the same leaderboard() at fetch time, and the margin chart re-derives from points
// for/against in the standings.
//
// The live view's playoff-race card has no historical meaning — clinching scenarios for a
// season that ended years ago — so a finished season shows its notable games instead.
function SeasonStats({ season, tz, onPickTeam, onPickPlayer, onOpen }) {
  const t = season.totals
  const [open, setOpen] = useState(null)
  const toggle = (k) => setOpen((v) => (v === k ? null : k))

  const rows = useMemo(() => seasonScoring(season.standings, TEAM_BY_ABBR), [season])
  // Rejoin each board row to the season's player table, so a row reaching the leaders
  // card or the player pop-out carries the same full stat line a live row does.
  const getRows = useMemo(
    () => (cat) =>
      season.leaders[cat.key].map((r) => ({ ...season.players[r.id], rank: r.rank, value: r.value })),
    [season]
  )

  const margin = (g) => Math.abs(g.score[0] - g.score[1])

  return (
    <>
      <div className="card">
        <h3 className="card-title">{season.label} in numbers</h3>
        <div className="tiles">
          <Tile label="Games played" value={t.played} sub="regular season" />
          <Tile label="Points scored" value={t.points.toLocaleString()} />
          <Tile label="Points per game" value={t.combinedPpg.toFixed(1)} sub="both teams" />
          <Tile
            label="Home win rate"
            value={`${Math.round((t.homeWins / t.played) * 100)}%`}
            sub={`${t.homeWins} of ${t.played}`}
          />
          <Tile label="Overtime games" value={t.ot} />
          <Tile label="Ties" value={t.ties} sub="the NFL's own quirk" />
          <Tile
            label="One-score finishes"
            value={t.oneScore}
            sub={`within ${LEAGUE.closeMargin}`}
          />
          <Tile label="Shutouts" value={t.shutouts} />
          <Tile
            label="Closest games"
            value={t.closest.length}
            onClick={() => toggle('closest')}
            open={open === 'closest'}
          />
          <Tile
            label="Highest scoring"
            value={t.highest.length}
            onClick={() => toggle('highest')}
            open={open === 'highest'}
          />
        </div>
        {open === 'closest' && (
          <GameList games={t.closest} tz={tz} onOpen={onOpen} note={(g) => `by ${margin(g)}`} />
        )}
        {open === 'highest' && (
          <GameList
            games={t.highest}
            tz={tz}
            onOpen={onOpen}
            note={(g) => `${g.score[0] + g.score[1]} total`}
          />
        )}
        <p className="fine">
          Totals cover the regular season. The five closest and five highest-scoring games
          are the only regular-season games kept — each still opens its box score.
        </p>
      </div>

      <Leaders
        getRows={getRows}
        onPickTeam={onPickTeam}
        onPickPlayer={onPickPlayer}
        showTeam={false}
      />
      <p className="fine">
        Leaders show no team badge: ESPN reports a player&apos;s current club even when an
        older season is asked for, and only for players who later moved — so the badges
        would be right for some rows and wrong for others. The names and numbers are that
        season&apos;s.
      </p>

      <MarginChart rows={rows} onPickTeam={onPickTeam} />
    </>
  )
}

/* ── Every Super Bowl in the archive ───────────────────────────────────── */

function SuperBowls({ seasons, onPick, onSeason }) {
  const rows = useMemo(() => superBowlRuns(seasons), [seasons])
  const bySeason = useMemo(
    () =>
      seasons.map((s) => ({ season: s, sb: superBowlSummary(s), best: bestRecord(s) })),
    [seasons]
  )

  return (
    <>
      <div className="card">
        <h3 className="card-title">Super Bowls</h3>
        <div className="table-scroll">
          <table className="standings hy-table">
            <thead>
              <tr>
                <th>Season</th>
                <th className="col-team">Champion</th>
                <th className="num">Seed</th>
                <th className="col-team">Runner-up</th>
                <th className="num">Seed</th>
                <th className="num">Score</th>
                <th className="col-team hide-sm">Best record</th>
              </tr>
            </thead>
            <tbody>
              {bySeason.map(({ season, sb, best }) => (
                <tr key={season.year}>
                  <td>
                    <button className="hy-year" onClick={() => onSeason?.(season.year)}>
                      {season.label}
                    </button>
                  </td>
                  <td className="col-team">
                    <TeamChip abbr={sb.winner} onPick={onPick} />
                  </td>
                  <td className="num">{seedOf(season, sb.winner)}</td>
                  <td className="col-team">
                    <TeamChip abbr={sb.loser} onPick={onPick} />
                  </td>
                  <td className="num">{seedOf(season, sb.loser)}</td>
                  <td className="num">
                    {sb.score[0]}–{sb.score[1]}
                  </td>
                  <td className="col-team hide-sm">
                    <TeamChip abbr={best.abbr} onPick={onPick} />
                    <span className="dim"> {teamRecord(best)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          Seed is the one column that ages well: it says whether a champion was the team
          everyone expected in January. {rows.filter((r) => r.seed > 1).length} of{' '}
          {rows.length} Super Bowl teams here came from outside the top seed.
        </p>
      </div>
    </>
  )
}

export default function HistoryView({
  season,
  onSeason,
  tz,
  onPick,
  onOpen,
  onPickPlayer,
  seasons = HISTORY,
}) {
  const [mode, setMode] = useState('season')
  // An unknown ?season= (a stale link, or one pointing at the current season) falls back
  // to the most recent archived year rather than rendering nothing.
  const year = HISTORY_BY_YEAR[season] ? season : HISTORY_YEARS[0]
  const data = HISTORY_BY_YEAR[year]

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>History</h2>
          <p className="sub">
            Every completed season since <strong>2021</strong> — the first year with both a
            17-game regular season and the current 14-team playoff, which is what makes
            these seasons directly comparable. Each carries its final standings, its full
            bracket, and a season of statistics.
          </p>
        </div>
        <div className="view-tools" role="group" aria-label="History mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`chip ${mode === m.key ? 'on' : ''}`}
              onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {SEASON_SCOPED.has(mode) && (
        <div className="hy-pick">
          <label className="season-pick">
            <span className="sr-only">Season</span>
            <select value={year} onChange={(e) => onSeason?.(Number(e.target.value))}>
              {HISTORY_YEARS.map((y) => (
                <option key={y} value={y}>
                  {HISTORY_BY_YEAR[y].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {mode === 'season' && <Season season={data} tz={tz} onPick={onPick} onOpen={onOpen} />}

      {mode === 'stats' && (
        <SeasonStats
          season={data}
          tz={tz}
          onPickTeam={onPick}
          onPickPlayer={onPickPlayer}
          onOpen={onOpen}
        />
      )}

      {mode === 'champions' && (
        <SuperBowls seasons={seasons} onPick={onPick} onSeason={onSeason} />
      )}
    </section>
  )
}
