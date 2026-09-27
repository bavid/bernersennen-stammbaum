// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import ScrollToTop from './ScrollToTop.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let navigate
function Navigator() {
  navigate = useNavigate()
  return <p>Seite</p>
}

test('page survives route changes when scrollTo returns a Promise (Chrome 150+)', async () => {
  const scrollTo = vi.fn(() => Promise.resolve())
  window.scrollTo = scrollTo
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const container = document.createElement('div')
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/stammbaum']}>
        <ScrollToTop />
        <Navigator />
      </MemoryRouter>
    )
  })
  try {
    await act(async () => {
      navigate('/tier/1')
    })
  } catch {
    // Ein Absturz zeigt sich unten am leeren Container
  }

  expect(container.textContent).toBe('Seite')
  expect(scrollTo).toHaveBeenCalledTimes(2)
  await act(async () => root.unmount())
})
