import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Escape to close, focus trapped inside while open, focus restored to whatever opened
// it on close. Applied to any dialog so the behaviour is identical everywhere.
export function useModalA11y(onClose, isOpen = true) {
  const ref = useRef(null)
  const restoreTo = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    restoreTo.current = document.activeElement

    const node = ref.current
    node?.querySelector(FOCUSABLE)?.focus() ?? node?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !node) return

      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]

      // Wrap at both ends so focus can never escape to the page behind.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = prevOverflow
      // Only restore focus if it's still inside the dialog we're tearing down.
      if (restoreTo.current?.isConnected) restoreTo.current.focus?.()
    }
  }, [onClose, isOpen])

  return ref
}
