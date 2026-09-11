import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// When there are no local feeds the shelf must vanish rather than render an empty
// <details>. The real slate can carry a regional feed now (a team's RSN), and which
// games do varies refresh to refresh, so this drives the empty case with a
// mocked-empty LOCAL_CATALOG instead of the live data. The populated case lives in
// servicesmodal-local.cov.test.jsx. See the family memory `refresh-stable-tests`.
// vi.mock is hoisted above every top-level import.
vi.mock('../src/utils/watch.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, LOCAL_CATALOG: [] }
})

import ServicesModal from '../src/components/ServicesModal.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { LOCAL_CATALOG } from '../src/utils/watch.js'

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
