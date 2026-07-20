import { TEAM_BY_ABBR } from '../data/teams.js'

// Logos are mirrored into public/logos/ by scripts/fetch-schedule.mjs, so this makes
// no external requests. Each team ships a light and a dark variant; CSS picks one via
// the theme attribute rather than JS, so it switches with no re-render.
export default function TeamLogo({ abbr, size = 28, className = '' }) {
  const team = TEAM_BY_ABBR[abbr]
  if (!team) return null
  const base = `${import.meta.env.BASE_URL}logos/${team.slug}`
  return (
    <span className={`logo ${className}`} style={{ '--logo-size': `${size}px` }}>
      <img className="logo-light" src={`${base}.png`} alt="" width={size} height={size} loading="lazy" />
      <img className="logo-dark" src={`${base}-dark.png`} alt="" width={size} height={size} loading="lazy" />
    </span>
  )
}
