import { Fragment, useEffect, useMemo, useState } from 'react'
import { buildBracket, blindBracket } from '../utils/bracket.js'
import { PLAYOFF } from '../config/league.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// Track a CSS media query, as the NBA bracket does. jsdom (tests) has no matchMedia, so this
// reports false there and the desktop layout renders.
function useMediaQuery(query) {
  const supported = typeof window.matchMedia === 'function'
  const [matches, setMatches] = useState(() => (supported ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!supported) return
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query, supported])
  return matches
}

// Pill labels for the phone round selector. "Conf" alone reads as a fragment on a button.
const ROUND_PILL = { WC: 'Wild Card', DIV: 'Divisional', CONF: 'Conference', SB: 'Super Bowl' }

// Nothing from the WNBA bracket carries over: that one is a best-of-N SERIES tree (series
// dots, "best of", win counts). The NFL is SINGLE ELIMINATION — every slot is one game, so
// a slot shows a single score line and highlights the winner outright.

// Both are called only with the literal round keys WC/DIV/CONF/SB, which always resolve,
// so the optional-chain and `|| key` fallbacks are unreachable.
/* v8 ignore start */
const roundShort = (key) => PLAYOFF.rounds.find((r) => r.key === key)?.short || key
const roundName = (key) => PLAYOFF.rounds.find((r) => r.key === key)?.name || key
/* v8 ignore stop */

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
function Match({ m, onPick, onOpen }) {
  // Every Match is fed a real matchup object (WC/DIV arrays, CONF, sb); m is never null,
  // so this guard is defensive only.
  /* v8 ignore next */
  if (!m) return null
  const decided = m.played
  const homeScore = m.score?.[0]
  const awayScore = m.score?.[1]
  // Spoiler-free mode (see blindBracket) clears `played` but keeps the game's handle.
  const canOpen = (decided || m.playedHidden) && m.id

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
      {(m.live || (m.statusLabel && !decided) || canOpen) && (
        <div className="bx-match-foot">
          {m.live && <span className="bx-live">● LIVE</span>}
          {m.statusLabel && <span className="bx-match-status">{m.statusLabel}</span>}
          {/* The matchup is the only per-game handle the bracket offers; without this
              there's no way to ask what actually happened in a playoff game. */}
          {canOpen && (
            <button className="bx-match-open" onClick={() => onOpen?.(m)}>
              Box score
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// The #1 seed sitting out the Wild Card round. Name/logo still open the team panel.
function Bye({ abbr, onPick }) {
  // Bye renders only behind a truthy `data.byeTeam` guard, so abbr is always a real team;
  // the `: null` and `if (!team)` fallbacks are unreachable.
  /* v8 ignore start */
  const team = abbr ? TEAM_BY_ABBR[abbr] : null
  if (!team) return null
  /* v8 ignore stop */
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
function ConfBracket({ conf, data, side, onPick, onOpen }) {
  return (
    <div className={`bx-conf bx-conf-${side}`}>
      <h3 className="bx-conf-label">{conf}</h3>
      <div className="bx-conf-rounds">
        <div className="bx-col">
          <h4 className="bx-round">{roundShort('WC')}</h4>
          {data.WC.map((m, i) => (
            <Match key={i} m={m} onPick={onPick} onOpen={onOpen} />
          ))}
          {data.byeTeam && <Bye abbr={data.byeTeam} onPick={onPick} />}
        </div>
        <div className="bx-col">
          <h4 className="bx-round">{roundShort('DIV')}</h4>
          {data.DIV.map((m, i) => (
            <Match key={i} m={m} onPick={onPick} onOpen={onOpen} />
          ))}
        </div>
        <div className="bx-col">
          <h4 className="bx-round">{roundShort('CONF')}</h4>
          <Match m={data.CONF} onPick={onPick} onOpen={onOpen} />
        </div>
      </div>
    </div>
  )
}

// Phones: one round at a time, chosen from a pill selector, as a full-width list. Seven
// columns of cards cannot fit a 390px screen, and the NBA bracket uses this same pattern.
function MobileBracket({ conferences, sb, champion, onPick, onOpen }) {
  const groups = {
    WC: (c) => conferences[c].WC,
    DIV: (c) => conferences[c].DIV,
    CONF: (c) => [conferences[c].CONF],
  }
  const decided = (m) => m.played
  const firstOpen = ['WC', 'DIV', 'CONF'].find((k) =>
    ['AFC', 'NFC'].some((c) => !groups[k](c).every(decided))
  )
  // Open on the earliest round still undecided, else the Super Bowl.
  const [active, setActive] = useState(firstOpen ?? 'SB')

  return (
    <div className="bx-mobile">
      <div className="bx-round-tabs" role="tablist" aria-label="Playoff rounds">
        {Object.keys(ROUND_PILL).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={key === active}
            className={`bx-round-btn${key === active ? ' active' : ''}`}
            onClick={() => setActive(key)}
          >
            {ROUND_PILL[key]}
          </button>
        ))}
      </div>
      <div className="bx-mobile-list">
        {active === 'SB' ? (
          <>
            <Match m={sb} onPick={onPick} onOpen={onOpen} />
            {champion && <div className="bx-sb-champ">🏆 {TEAM_BY_ABBR[champion]?.name}</div>}
          </>
        ) : (
          ['AFC', 'NFC'].map((c) => (
            <Fragment key={c}>
              <h4 className="bx-mobile-conf">{c}</h4>
              {groups[active](c).map((m, i) => (
                <Match key={i} m={m} onPick={onPick} onOpen={onOpen} />
              ))}
              {active === 'WC' && conferences[c].byeTeam && (
                <Bye abbr={conferences[c].byeTeam} onPick={onPick} />
              )}
            </Fragment>
          ))
        )}
      </div>
    </div>
  )
}

// The bracket itself, without the page heading around it.
//
// Split out from the Playoffs view so the History tab can render an archived season
// through exactly this component. A historical season ships its final standings and only
// its 13 postseason games, so it passes `seeds` in rather than having them derived from
// regular-season results it doesn't carry.
export function BracketBody({ games, seeds, tz, onPick, onOpen, hideScores = false }) {
  const bracket = useMemo(() => {
    const built = buildBracket(games, seeds)
    return hideScores ? blindBracket(built) : built
  }, [games, seeds, hideScores])
  const { conferences, sb, champion, regularSeasonStarted, hasPostseason } = bracket
  const isMobile = useMediaQuery('(max-width: 720px)')

  return (
    <>
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
              🏆 <strong>{TEAM_BY_ABBR[champion]?.displayName}</strong> win the Super Bowl
              {sb.score && (
                <>
                  , beating {TEAM_BY_ABBR[sb.home === champion ? sb.away : sb.home]?.displayName}{' '}
                  {Math.max(...sb.score)}–{Math.min(...sb.score)}
                </>
              )}
              .
            </p>
          )}

          {isMobile ? (
            <MobileBracket
              conferences={conferences}
              sb={sb}
              champion={champion}
              onPick={onPick}
              onOpen={onOpen}
            />
          ) : (
            <div className="bx-bracket">
              <ConfBracket conf="AFC" data={conferences.AFC} side="afc" onPick={onPick} onOpen={onOpen} />

              <div className="bx-sb">
                <h4 className="bx-sb-label">{roundName('SB')}</h4>
                <Match m={sb} onPick={onPick} onOpen={onOpen} />
                {champion && (
                  <div className="bx-sb-champ">🏆 {TEAM_BY_ABBR[champion]?.name}</div>
                )}
              </div>

              <ConfBracket conf="NFC" data={conferences.NFC} side="nfc" onPick={onPick} onOpen={onOpen} />
            </div>
          )}
        </>
      )}
    </>
  )
}

export default function Bracket({ games, tz, onPick, onOpen, hideScores = false }) {
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

      <BracketBody games={games} tz={tz} onPick={onPick} onOpen={onOpen} hideScores={hideScores} />
    </section>
  )
}
