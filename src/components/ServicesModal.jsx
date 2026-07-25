import { SERVICE_CATALOG } from '../utils/watch.js'
import { useServices } from '../context/services.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'

// Pick which streaming services / TV packages are "mine". Drives the schedule's
// "on my services" filter and the personalized 📺 badges on game cards.
export default function ServicesModal({ onClose }) {
  const { has, toggle, count, clear } = useServices()
  const ref = useModalA11y(onClose)

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal services-modal"
        role="dialog"
        aria-modal="true"
        aria-label="My services"
        ref={ref}
        tabIndex={-1}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="cal-title">📺 My services</h3>
        <p className="cal-note">
          Pick the streaming services and TV packages you have. The schedule can then
          filter to just the games you can watch, and each card highlights how. Saved on
          this device only — live-TV bundle coverage is approximate, and Sunday-afternoon
          CBS/FOX games are regional (which one your market gets depends on where you are).
        </p>

        <div className="svc-list">
          {SERVICE_CATALOG.map((s) => (
            <label key={s.key} className={`svc-item ${has(s.key) ? 'on' : ''}`}>
              <input type="checkbox" checked={has(s.key)} onChange={() => toggle(s.key)} />
              <span className="svc-name">{s.label}</span>
              <span className="svc-kind">{s.kind === 'bundle' ? 'Live TV' : 'Streaming'}</span>
            </label>
          ))}
        </div>

        <div className="svc-foot">
          <span className="dim">{count} selected</span>
          <span className="svc-foot-actions">
            {count > 0 && (
              <button className="cal-btn-ghost" onClick={clear}>
                Clear all
              </button>
            )}
            <button className="cal-btn-primary" onClick={onClose}>
              Done
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
