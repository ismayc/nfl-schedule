import { useState } from 'react'
import { SEASON } from '../data/teams.js'
import { LEAGUE } from '../config/league.js'
import { downloadIcs, webcalUrl, googleCalendarUrl } from '../utils/ics.js'
import { useFollow } from '../context/follow.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'

// A subscription must point at the DEPLOYED feed — a localhost URL can't be subscribed
// to, and only Netlify serves the function (GitHub Pages ships the static download only).
// So the webcal/Google links always use the production Netlify origin, regardless of
// where the app itself is being served from.
const PROD = 'https://the-nfl-schedule.netlify.app'
const FEED = `${PROD}/calendar.ics`

function SubRow({ label, httpsUrl }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (insecure context / denied) — the visible URL still works */
    }
  }
  return (
    <div className="cal-row">
      <span className="cal-row-label">{label}</span>
      <div className="cal-row-actions">
        <a className="cal-btn-primary" href={webcalUrl(httpsUrl)}>
          Subscribe
        </a>
        <a
          className="cal-btn-ghost"
          href={googleCalendarUrl(httpsUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Google
        </a>
        <button className="cal-btn-ghost" onClick={copy}>
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
      </div>
    </div>
  )
}

// games = the whole committed season; filtered = whatever the schedule filters currently
// show. Subscriptions cover "all" and "my teams" (the two stable sets); the one-time
// downloads additionally offer the current filter, since that's a per-session choice.
export default function CalendarModal({ games, filtered, onClose }) {
  const { followed, count } = useFollow()
  const ref = useModalA11y(onClose)

  const teamsParam = [...followed].join(',')
  const myFeed = `${FEED}?teams=${teamsParam}`
  const myGames = games.filter((g) => followed.has(g.home) || followed.has(g.away))

  return (
    <div
      className="modal-wrap"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal cal-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Calendar"
        ref={ref}
        tabIndex={-1}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="cal-title">📅 Calendar</h3>

        <div className="cal-section">
          <h4>
            Subscribe <span className="cal-hint">auto-updates as scores go final</span>
          </h4>
          <SubRow label={`All ${games.length} games`} httpsUrl={FEED} />
          {count > 0 && <SubRow label={`My teams (${count})`} httpsUrl={myFeed} />}
          <p className="cal-note">
            “Subscribe” opens your default calendar app. On Google Calendar, use the Google
            button. The feed refreshes about every half hour.
          </p>
        </div>

        <div className="cal-section">
          <h4>
            One-time download <span className="cal-hint">snapshot, won’t update</span>
          </h4>
          <div className="cal-downloads">
            <button
              onClick={() =>
                downloadIcs(games, {
                  filename: `${LEAGUE.id}-${SEASON}.ics`,
                  name: `${LEAGUE.name} ${SEASON}`,
                })
              }
            >
              All games ({games.length})
            </button>
            {filtered.length !== games.length && (
              <button
                onClick={() =>
                  downloadIcs(filtered, {
                    filename: `${LEAGUE.id}-${SEASON}-filtered.ics`,
                    name: `${LEAGUE.name} ${SEASON}`,
                  })
                }
              >
                Current filter ({filtered.length})
              </button>
            )}
            {count > 0 && (
              <button
                onClick={() =>
                  downloadIcs(myGames, {
                    filename: `${LEAGUE.id}-${SEASON}-my-teams.ics`,
                    name: `${LEAGUE.name} ${SEASON} — My Teams`,
                  })
                }
              >
                My teams ({myGames.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
