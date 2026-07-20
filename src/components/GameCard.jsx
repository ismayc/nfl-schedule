import { TEAM_BY_ABBR } from '../data/teams.js'
import { LEAGUE } from '../config/league.js'
import { formatTime, formatZoneAbbr, liveState, countdown } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// Halftime and end-of-quarter are stable states; a running clock is not. Falls back
// to ESPN's own label when the period is unknown.
export function livePeriod(game) {
  const label = game.statusLabel || ''
  if (/half/i.test(label)) return 'HALF'
  if (/end/i.test(label)) return label.toUpperCase()
  const p = game.period
  if (!p) return label.toUpperCase() || 'LIVE'
  return p > 4
    ? p - 4 > 1
      ? `${LEAGUE.overtimeLabel}${p - 4}`
      : LEAGUE.overtimeLabel
    : `${LEAGUE.periodShort}${p}`
}

function Side({ abbr, score, winner, hideScores }) {
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed, toggle } = useFollow()
  const on = isFollowed(abbr)

  return (
    <div className={`side ${winner ? 'winner' : ''} ${on ? 'followed' : ''}`}>
      <button
        className={`star ${on ? 'on' : ''}`}
        // The whole card is a button that opens the game detail, so the star has to
        // stop the click from reaching it — otherwise following also opens a modal.
        onClick={(e) => {
          e.stopPropagation()
          toggle(abbr)
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={on}
        aria-label={`${on ? 'Unfollow' : 'Follow'} ${team?.displayName || abbr}`}
        title={`${on ? 'Unfollow' : 'Follow'} ${team?.displayName || abbr}`}
      >
        {on ? '★' : '☆'}
      </button>
      <TeamLogo abbr={abbr} size={32} />
      <span className="side-name">
        <span className="side-loc">{team?.location}</span>
        <span className="side-nick">{team?.name}</span>
      </span>
      {score != null && !hideScores && <span className="side-score">{score}</span>}
    </div>
  )
}

export default function GameCard({ game, tz, hideScores, onOpen }) {
  const state = liveState(game)
  const scored = game.score && !hideScores
  const [hs, as] = game.score || []
  const homeWon = scored && hs > as
  const awayWon = scored && as > hs

  const meta = []
  if (game.venue) meta.push(game.city ? `${game.venue}, ${game.city}` : game.venue)
  if (game.broadcast?.length) meta.push(game.broadcast.slice(0, 3).join(' · '))

  return (
    <article
      className={`game state-${state}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(game)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen?.(game))}
    >
      <div className="game-when">
        {state === 'live' ? (
          // A football score can change on any snap and the game clock runs live, so
          // anything shown here is stale by up to one refresh. The quarter is durable
          // enough to display; the exact game clock is not, so it stays in the tooltip.
          <span className="live-badge" title={`${game.statusLabel || 'Live'} — as of the last refresh`}>
            ● {livePeriod(game)}
          </span>
        ) : state === 'void' ? (
          <span className="void-badge">{game.canceled ? 'Canceled' : 'Postponed'}</span>
        ) : game.score ? (
          <span className="final-badge">Final{game.ot ? (game.ot > 1 ? `/${game.ot}OT` : '/OT') : ''}</span>
        ) : (
          <>
            <span className="time">{formatTime(game.tip, tz)}</span>
            <span className="zone">{formatZoneAbbr(game.tip, tz)}</span>
          </>
        )}
      </div>

      <div className="game-teams">
        <Side abbr={game.away} score={as} winner={awayWon} hideScores={hideScores} />
        <span className="at">@</span>
        <Side abbr={game.home} score={hs} winner={homeWon} hideScores={hideScores} />
      </div>

      <div className="game-meta">
        {game.week != null && <span className="wk-tag">Wk {game.week}</span>}
        {game.note && <span className="note">{game.note}</span>}
        {meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
        {state === 'upcoming' && countdown(game.tip) && (
          <span className="countdown">in {countdown(game.tip)}</span>
        )}
      </div>
    </article>
  )
}
