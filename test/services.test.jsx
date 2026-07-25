import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServicesProvider, useServices } from '../src/context/services.jsx'
import ServicesModal from '../src/components/ServicesModal.jsx'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// A tiny probe that surfaces the context so the provider can be tested directly.
function Probe() {
  const { services, has, toggle, clear, count } = useServices()
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="list">{services.join(',')}</span>
      <span data-testid="has-prime">{String(has('prime'))}</span>
      <button onClick={() => toggle('prime')}>toggle-prime</button>
      <button onClick={() => toggle('bogus')}>toggle-bogus</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <ServicesProvider>
      <Probe />
    </ServicesProvider>
  )

describe('ServicesProvider / useServices', () => {
  it('falls back to an inert context with no provider', () => {
    render(<Probe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    // toggle and clear are inert no-ops; nothing throws.
    fireEvent.click(screen.getByText('toggle-prime'))
    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('has-prime').textContent).toBe('false')
  })

  it('loads saved services and drops keys the catalog no longer defines', () => {
    localStorage.setItem('nfl:services', JSON.stringify(['prime', 'ghost', 'youtubetv']))
    renderProbe()
    expect(screen.getByTestId('list').textContent).toBe('prime,youtubetv')
    expect(screen.getByTestId('count').textContent).toBe('2')
  })

  it('tolerates a corrupt / non-array saved value', () => {
    localStorage.setItem('nfl:services', '{not json')
    renderProbe()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('ignores a non-array JSON value', () => {
    localStorage.setItem('nfl:services', JSON.stringify({ prime: true }))
    renderProbe()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('toggles a valid key on and off and persists it', () => {
    renderProbe()
    fireEvent.click(screen.getByText('toggle-prime'))
    expect(screen.getByTestId('has-prime').textContent).toBe('true')
    expect(JSON.parse(localStorage.getItem('nfl:services'))).toEqual(['prime'])
    fireEvent.click(screen.getByText('toggle-prime'))
    expect(screen.getByTestId('has-prime').textContent).toBe('false')
    expect(JSON.parse(localStorage.getItem('nfl:services'))).toEqual([])
  })

  it('ignores an unknown key', () => {
    renderProbe()
    fireEvent.click(screen.getByText('toggle-bogus'))
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('clears everything', () => {
    localStorage.setItem('nfl:services', JSON.stringify(['prime', 'youtubetv']))
    renderProbe()
    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('starts empty when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderProbe()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('swallows a write that throws (private mode)', () => {
    renderProbe()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    // Toggling still updates state even though the persist throws.
    fireEvent.click(screen.getByText('toggle-prime'))
    expect(screen.getByTestId('has-prime').textContent).toBe('true')
  })
})

describe('ServicesModal', () => {
  const renderModal = (onClose = () => {}) =>
    render(
      <ServicesProvider>
        <ServicesModal onClose={onClose} />
      </ServicesProvider>
    )

  it('lists the catalog and toggles a service on', async () => {
    const user = userEvent.setup()
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'My services' })
    expect(within(dialog).getByText('Prime Video')).toBeInTheDocument()
    expect(within(dialog).getByText('YouTube TV')).toBeInTheDocument()

    expect(within(dialog).getByText('0 selected')).toBeInTheDocument()
    await user.click(within(dialog).getByText('Prime Video'))
    expect(within(dialog).getByText('1 selected')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('nfl:services'))).toEqual(['prime'])
  })

  it('shows Clear all only once something is selected, and clears', async () => {
    localStorage.setItem('nfl:services', JSON.stringify(['prime', 'youtubetv']))
    const user = userEvent.setup()
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'My services' })
    expect(within(dialog).getByText('2 selected')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }))
    expect(within(dialog).getByText('0 selected')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('closes via Done and the ✕', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal(onClose)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closes when the backdrop is clicked, but not a click inside the dialog', () => {
    const onClose = vi.fn()
    const { container } = renderModal(onClose)
    // A press inside the dialog does not close it.
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'My services' }))
    expect(onClose).not.toHaveBeenCalled()
    // A press on the backdrop does.
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
