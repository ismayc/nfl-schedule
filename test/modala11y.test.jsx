import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useModalA11y } from '../src/hooks/useModalA11y.js'

// jsdom reports offsetParent === null for every element, which the hook's Tab
// visibility filter would treat as "not focusable". Make rendered elements look
// visible so the focus-trap logic runs.
let origOffsetParent
beforeAll(() => {
  origOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentNode
    },
  })
})
afterAll(() => {
  if (origOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', origOffsetParent)
})

afterEach(cleanup)

function Modal({ onClose, isOpen = true, empty = false }) {
  const ref = useModalA11y(onClose, isOpen)
  return (
    <div ref={ref} tabIndex={-1} data-testid="dialog">
      {!empty && (
        <>
          <button data-testid="first">First</button>
          <button data-testid="middle">Middle</button>
          <button data-testid="last">Last</button>
        </>
      )}
    </div>
  )
}

describe('useModalA11y', () => {
  it('moves focus into the dialog on open', () => {
    const { getByTestId } = render(<Modal onClose={() => {}} />)
    const dialog = getByTestId('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('focuses the container when there are no focusable children', () => {
    const { getByTestId } = render(<Modal onClose={() => {}} empty />)
    expect(document.activeElement).toBe(getByTestId('dialog'))
  })

  it('hides body overflow while open and restores it on unmount', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = render(<Modal onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not throw on Escape when no onClose is supplied', () => {
    render(<Modal onClose={undefined} />)
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow()
  })

  it('ignores non-Tab, non-Escape keys', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('wraps focus from last to first on Tab', () => {
    const { getByTestId } = render(<Modal onClose={() => {}} />)
    getByTestId('last').focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(getByTestId('first'))
  })

  it('wraps focus from first to last on Shift+Tab', () => {
    const { getByTestId } = render(<Modal onClose={() => {}} />)
    getByTestId('first').focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(getByTestId('last'))
  })

  it('does not wrap when focus is in the middle', () => {
    const { getByTestId } = render(<Modal onClose={() => {}} />)
    getByTestId('middle').focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(getByTestId('middle'))
  })

  it('does not wrap on Shift+Tab from the middle', () => {
    const { getByTestId } = render(<Modal onClose={() => {}} />)
    getByTestId('middle').focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(getByTestId('middle'))
  })

  it('Tab is a no-op when there are no focusable elements', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} empty />)
    expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restores focus to the previously focused element on unmount', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = render(<Modal onClose={() => {}} />)
    expect(document.activeElement).not.toBe(trigger) // moved into dialog
    unmount()
    expect(document.activeElement).toBe(trigger) // restored
    trigger.remove()
  })

  it('does not restore focus to a trigger that has left the DOM', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { unmount } = render(<Modal onClose={() => {}} />)
    trigger.remove() // the opener is gone before the dialog closes
    expect(() => unmount()).not.toThrow()
  })

  it('is inert when isOpen is false', () => {
    const onClose = vi.fn()
    document.body.style.overflow = ''
    render(<Modal onClose={onClose} isOpen={false} />)
    // No focus trap, no Escape handling, no body lock.
    expect(document.body.style.overflow).toBe('')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
