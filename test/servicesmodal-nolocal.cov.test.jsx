import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ServicesModal from '../src/components/ServicesModal.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { LOCAL_CATALOG } from '../src/utils/watch.js'

// The real slate is entirely national, so the shelf must vanish rather than render
// an empty <details>. (The populated case lives in servicesmodal-local.cov.test.jsx.)
describe('ServicesModal — no local channels in the data', () => {
  it('hides the local-channel shelf entirely', () => {
    expect(LOCAL_CATALOG).toEqual([])
    const { container } = render(
      <ServicesProvider>
        <ServicesModal onClose={() => {}} />
      </ServicesProvider>
    )
    expect(container.querySelector('.svc-local')).toBeNull()
    expect(container.querySelectorAll('.svc-item').length).toBeGreaterThan(0)
  })
})
