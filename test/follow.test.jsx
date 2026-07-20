import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'

const KEY = 'nfl:followed'

const wrap = (ui) => render(<FollowProvider>{ui}</FollowProvider>)

function Probe() {
  const { followed, count, toggle, clear, isFollowed } = useFollow()
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="list">{[...followed].sort().join(',')}</span>
      <span data-testid="has-kc">{String(isFollowed('KC'))}</span>
      <button onClick={() => toggle('KC')}>kc</button>
      <button onClick={() => toggle('BUF')}>buf</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the follow store', () => {
  it('adds, removes, counts, isFollowed, and clears', async () => {
    wrap(<Probe />)
    const count = () => screen.getByTestId('count').textContent

    await userEvent.click(screen.getByText('kc'))
    await userEvent.click(screen.getByText('buf'))
    expect(count()).toBe('2')
    expect(screen.getByTestId('list').textContent).toBe('BUF,KC')
    expect(screen.getByTestId('has-kc').textContent).toBe('true')

    await userEvent.click(screen.getByText('kc')) // toggles back off
    expect(count()).toBe('1')
    expect(screen.getByTestId('has-kc').textContent).toBe('false')

    await userEvent.click(screen.getByText('clear'))
    expect(count()).toBe('0')
    expect(screen.getByTestId('list').textContent).toBe('')
  })

  it('persists followed teams to localStorage under the nfl:followed key', async () => {
    wrap(<Probe />)
    await userEvent.click(screen.getByText('kc'))
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(['KC'])
  })

  it('reads its initial state from localStorage on mount', () => {
    localStorage.setItem(KEY, JSON.stringify(['KC', 'BUF']))
    wrap(<Probe />)
    expect(screen.getByTestId('count').textContent).toBe('2')
    expect(screen.getByTestId('has-kc').textContent).toBe('true')
  })

  it('survives corrupt localStorage rather than crashing', () => {
    localStorage.setItem(KEY, 'not json')
    wrap(<Probe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('tolerates a localStorage that throws on write (private mode)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    wrap(<Probe />)
    // Toggling still updates in-memory state; the failed persist is swallowed.
    await expect(userEvent.click(screen.getByText('kc'))).resolves.toBeUndefined()
    expect(screen.getByTestId('count').textContent).toBe('1')
    expect(spy).toHaveBeenCalled()
  })

  it('renders standalone with an inert fallback when there is no provider', async () => {
    render(<Probe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('has-kc').textContent).toBe('false')
    // The fallback toggle/clear are no-ops that must not throw.
    await userEvent.click(screen.getByText('kc'))
    await userEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})
