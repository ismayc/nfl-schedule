import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import TeamLogo from '../src/components/TeamLogo.jsx'
import { TEAM_BY_ABBR } from '../src/data/teams.js'

afterEach(cleanup)

describe('TeamLogo', () => {
  it('renders a light and a dark image for a real team abbr', () => {
    const { container } = render(<TeamLogo abbr="ARI" />)
    const light = container.querySelector('img.logo-light')
    const dark = container.querySelector('img.logo-dark')
    expect(light).toBeTruthy()
    expect(dark).toBeTruthy()
    expect(light.getAttribute('src')).toContain(`${TEAM_BY_ABBR.ARI.slug}.png`)
    expect(dark.getAttribute('src')).toContain(`${TEAM_BY_ABBR.ARI.slug}-dark.png`)
  })

  it('honours the size prop on the wrapper and images', () => {
    const { container } = render(<TeamLogo abbr="ARI" size={40} />)
    const span = container.querySelector('span.logo')
    expect(span.style.getPropertyValue('--logo-size')).toBe('40px')
    expect(container.querySelector('img.logo-light').getAttribute('width')).toBe('40')
  })

  it('merges an extra className onto the wrapper', () => {
    const { container } = render(<TeamLogo abbr="ARI" className="badge" />)
    expect(container.querySelector('span.logo.badge')).toBeTruthy()
  })

  it('renders nothing for an unknown abbr', () => {
    const { container } = render(<TeamLogo abbr="ZZZ" />)
    expect(container.firstChild).toBeNull()
  })
})
