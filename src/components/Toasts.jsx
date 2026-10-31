import { TEAM_BY_ABBR } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'
import { LEAGUE } from '../config/league.js'

const nick = (abbr) => TEAM_BY_ABBR[abbr]?.name || abbr

// A close finish fires from the last regulation period on, so overtime needs its own
// words. The men's college game has two halves, so its last period is the second half.
const lateIn = (g) => {
  const n = LEAGUE.regulationPeriods
  if ((g.period ?? 0) > n) return 'in overtime'
  // A lookup, not a ternary: each league only ever has one of the two values.
  return { 2: 'in the second half', 4: 'in the fourth quarter' }[n]
}

function describe(e) {
  const { game: g, leader, margin } = e
  switch (e.kind) {
    case 'kickoff':
      return { icon: '🏈', label: LEAGUE.kickoffLabel, text: `${nick(g.away)} at ${nick(g.home)}` }
    case 'lead-change':
      return {
        icon: '🔄',
        label: 'Lead change',
        text: `${nick(leader)} by ${margin}`,
      }
    case 'nailbiter':
      return {
        icon: '🔥',
        label: 'Close game',
        text: margin === 0 ? `Tied ${lateIn(g)}` : `${nick(leader)} by ${margin} ${lateIn(g)}`,
      }
    case 'final': {
      const [hs, as] = g.score
      const win = leader === g.home ? hs : as
      const lose = leader === g.home ? as : hs
      return {
        icon: '✅',
        label: 'Final',
        text: leader === 'tie' ? 'Final' : `${nick(leader)} ${win}–${lose}`,
      }
    }
    default:
      return { icon: '•', label: '', text: '' }
  }
}

export default function Toasts({ events, onOpen, onDismiss }) {
  if (!events.length) return null

  return (
    // aria-live so a screen reader announces moments as they land, without stealing
    // focus from whatever the viewer is doing.
    <div className="toasts" role="status" aria-live="polite">
      {events.map((e) => {
        const { icon, label, text } = describe(e)
        return (
          <div className={`toast toast-${e.kind}`} key={e.key}>
            <button className="toast-body" onClick={() => onOpen?.(e.game)}>
              <span className="toast-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="toast-text">
                <span className="toast-label">{label}</span>
                <span className="toast-teams">
                  <TeamLogo abbr={e.game.away} size={15} />
                  <TeamLogo abbr={e.game.home} size={15} />
                  {text}
                </span>
              </span>
            </button>
            <button className="toast-x" onClick={() => onDismiss?.(e.key)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
