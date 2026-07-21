import { useEffect, useState } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { fetchPlayer, headshotUrl } from '../services/player.js'
import { flagUrl } from '../utils/flag.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import TeamLogo from './TeamLogo.jsx'

// Integers stay whole (yards, TDs); rates keep one decimal (passer rating, FG%).
const fmt = (v) => (Number.isInteger(v) ? v : v.toFixed(1))

// First + last initial, for the headshot fallback.
const initials = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// A player only carries the stats their position produces, so the tiles are chosen
// from this ordered list by which fields the committed row actually has — a QB gets
// passing tiles, a receiver gets receiving tiles, and so on. First six win.
const STAT_FIELDS = [
  { key: 'passYds', label: 'Pass YDS' },
  { key: 'passTD', label: 'Pass TD' },
  { key: 'passInt', label: 'Int' },
  { key: 'rating', label: 'Rating' },
  { key: 'rushYds', label: 'Rush YDS' },
  { key: 'rushTD', label: 'Rush TD' },
  { key: 'recYds', label: 'Rec YDS' },
  { key: 'rec', label: 'Rec' },
  { key: 'recTD', label: 'Rec TD' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'sacks', label: 'Sacks' },
  { key: 'defInt', label: 'Int' },
  { key: 'fgm', label: 'FG Made' },
]

export default function PlayerModal({ player, onClose }) {
  const ref = useModalA11y(onClose, !!player)
  const [extra, setExtra] = useState({ status: 'loading', bio: null })
  const [hasShot, setHasShot] = useState(true)
  const id = player?.id

  useEffect(() => {
    if (!id) return
    const ctrl = new AbortController()
    setHasShot(true) // reset the headshot fallback for the new player
    setExtra({ status: 'loading', bio: null })
    fetchPlayer(id, { signal: ctrl.signal }).then((data) => {
      if (ctrl.signal.aborted) return
      setExtra({ status: 'ready', bio: data?.bio ?? null })
    })
    return () => ctrl.abort()
  }, [id])

  if (!player) return null

  const team = TEAM_BY_ABBR[player.team]
  const { bio } = extra
  const tiles = STAT_FIELDS.filter((s) => player[s.key] != null).slice(0, 6)

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal player-modal"
        role="dialog"
        aria-modal="true"
        aria-label={player.name}
        ref={ref}
        tabIndex={-1}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="pm-head">
          {hasShot ? (
            <img
              className="pm-shot"
              src={headshotUrl(player.id)}
              alt=""
              loading="lazy"
              onError={() => setHasShot(false)}
            />
          ) : (
            <span className="pm-shot pm-initials" aria-hidden="true">
              {initials(player.name)}
            </span>
          )}
          <div className="pm-id">
            <strong className="pm-name">{player.name}</strong>
            <span className="pm-sub">
              {team && <TeamLogo abbr={player.team} size={16} />}
              {team?.displayName || player.team}
              {player.pos ? ` · ${player.pos}` : ''}
              {bio?.jersey ? ` · #${bio.jersey}` : ''}
            </span>
            {bio && (bio.height || bio.weight || bio.age || bio.college) && (
              <span className="pm-bio dim">
                {[bio.height, bio.weight, bio.age && `Age ${bio.age}`, bio.college]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            {bio?.country && (
              <span className="pm-origin dim">
                {flagUrl(bio.country) && (
                  <img
                    className="pm-flag"
                    src={flagUrl(bio.country)}
                    alt=""
                    width="20"
                    height="14"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}
                {bio.country}
              </span>
            )}
          </div>
        </div>

        <h4 className="md-sub">Season{player.gp != null ? ` · ${player.gp} GP` : ''}</h4>
        {tiles.length > 0 ? (
          <div className="pm-stats">
            {tiles.map((s) => (
              <div className="pm-stat" key={s.key}>
                <span className="pm-stat-v">{fmt(player[s.key])}</span>
                <span className="pm-stat-l">{s.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">No season stats yet.</p>
        )}
      </div>
    </div>
  )
}
