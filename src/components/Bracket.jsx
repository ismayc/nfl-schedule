import { useMemo } from 'react'
import { buildBracket } from '../utils/bracket.js'
import { PLAYOFF } from '../config/league.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// Nothing from the WNBA bracket carries over: that one is a best-of-N SERIES tree (series
// dots, "best of", win counts). The NFL is SINGLE ELIMINATION — every slot is one game, so
// a slot shows a single score line and highlights the winner outright.

const roundShort = (key) => PLAYOFF.rounds.find((r) => r.key === key)?.short || key
const roundName = (key) => PLAYOFF.rounds.find((r) => r.key === key)?.name || key

// One side of a matchup: seed + logo + name (+ score once played). The team is a button
// that opens the team panel via onPick — the slot itself is never a button, so there is no
// button-in-button nesting.
function Slot({ abbr, seed, score, isWinner, decided, onPick }) {
  const team = abbr ? TEAM_BY_ABBR[abbr] : null
  const { isFollowed } = useFollow()

  if (!team) {
    return (
      <div className="bx-side bx-empty">
        <span className="bx-feeder">TBD</span>
      </div>
    )
  }

  return (
    <div
      className={`bx-side ${isWinner ? 'bx-won' : decided ? 'bx-lost' : ''} ${
        isFollowed(abbr) ? 'followed' : ''
      }`}
    >
      {seed != null && <span className="bx-seed">{seed}</span>}
      <button className="bx-team" onClick={() => onPick?.(abbr)}>
        <TeamLogo abbr={abbr} size={24} />
        <span className="bx-name">{team.name}</span>
      </button>
      {score != null && <span className="bx-score">{score}</span>}
    </div>
  )
}

// A single-elimination matchup. `m` may be entirely projected (both seeds greyed) or have a
// null side (TBD). Score is [home, away]; a played game has a winner to highlight.
function Match({ m, onPick }) {
  if (!m) return null
  const decided = m.played
  const homeScore = m.score?.[0]
  const awayScore = m.score?.[1]

  return (
    <div
      className={`bx-match ${m.projected ? 'bx-match-proj' : ''} ${m.live ? 'bx-match-live' : ''} ${
        decided ? 'bx-match-done' : ''
      }`}
    >
      <Slot
        abbr={m.away}
        seed={m.seedAway}
        score={awayScore ?? null}
        isWinner={m.winner === m.away}
        decided={decided}
        onPick={onPick}
      />
      <Slot
        abbr={m.home}
        seed={m.seedHome}
        score={homeScore ?? null}
        isWinner={m.winner === m.home}
        decided={decided}
        onPick={onPick}
      />
      {(m.live || (m.statusLabel && !decided)) && (
        <div className="bx-match-foot">
          {m.live && <span className="bx-live">● LIVE</span>}
          {m.statusLabel && <span className="bx-match-status">{m.statusLabel}</span>}
        </div>
      )}
    </div>
  )
}

// The #1 seed sitting out the Wild Card round. Name/logo still open the team panel.
function Bye({ abbr, onPick }) {
  const team = abbr ? TEAM_BY_ABBR[abbr] : null
  if (!team) return null
  return (
    <div className="bx-bye">
      <span className="bx-seed">1</span>
      <button className="bx-team" onClick={() => onPick?.(abbr)}>
        <TeamLogo abbr={abbr} size={24} />
        <span className="bx-name">{team.name}</span>
      </button>
      <span className="bx-bye-tag">Bye</span>
    </div>
  )
}

// One conference's three rounds. `side` ('afc'|'nfc') lets the stylesheet mirror the NFC
// tree so both converge on the shared Super Bowl slot in the middle.
function ConfBracket({ conf, data, side, onPick }) {
  return (
    <div className={`bx-conf bx-conf-${side}`}>
      <h3 className="bx-conf-label">{conf}</h3>
      <div className="bx-conf-rounds">
        <div className="bx-col">
          <h4 className="bx-round">{roundShort('WC')}</h4>
          {data.WC.map((m, i) => (
            <Match key={i} m={m} onPick={onPick} />
          ))}
          {data.byeTeam && <Bye abbr={data.byeTeam} onPick={onPick} />}
        </div>
        <div className="bx-col">
          <h4 className="bx-round">{roundShort('DIV')}</h4>
          {data.DIV.map((m, i) => (
            <Match key={i} m={m} onPick={onPick} />
          ))}
        </div>
        <div className="bx-col">
          <h4 className="bx-round">{roundShort('CONF')}</h4>
          <Match m={data.CONF} onPick={onPick} />
        </div>
      </div>
    </div>
  )
}

export default function Bracket({ games, tz, onPick }) {
  const bracket = useMemo(() => buildBracket(games), [games])
  const { conferences, sb, champion, regularSeasonStarted, hasPostseason } = bracket

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Playoffs</h2>
          <p className="sub">
            Seven teams per conference. The No.&nbsp;1 seed earns a first-round bye; every
            round re-seeds so the top remaining seed hosts. Single elimination.
          </p>
        </div>
      </div>

      {!regularSeasonStarted ? (
        <div className="card">
          <h3 className="card-title">The bracket isn&apos;t set yet</h3>
          <p className="sub">
            The playoff bracket fills in as the season is played — seven teams per conference
            qualify: four division winners and three wild cards.
          </p>
        </div>
      ) : (
        <>
          {!hasPostseason && (
            <p className="banner">
              <strong>Projected.</strong> The postseason hasn&apos;t started, so this is the
              bracket you&apos;d get if the regular season ended today.
            </p>
          )}

          {champion && (
            <p className="banner banner-champ">
              🏆 <strong>{TEAM_BY_ABBR[champion]?.displayName}</strong> win the Super Bowl.
            </p>
          )}

          <div className="bx-bracket">
            <ConfBracket conf="AFC" data={conferences.AFC} side="afc" onPick={onPick} />

            <div className="bx-sb">
              <h4 className="bx-sb-label">{roundName('SB')}</h4>
              <Match m={sb} onPick={onPick} />
              {champion && (
                <div className="bx-sb-champ">🏆 {TEAM_BY_ABBR[champion]?.name}</div>
              )}
            </div>

            <ConfBracket conf="NFC" data={conferences.NFC} side="nfc" onPick={onPick} />
          </div>
        </>
      )}
    </section>
  )
}
