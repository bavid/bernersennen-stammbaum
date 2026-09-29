// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import PedigreeToolbar from './PedigreeToolbar.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  delete document.documentElement.dataset.theme
  document.title = ''
})

function render(themeId) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const noop = () => {}
  act(() =>
    root.render(
      <ThemeProvider themeId={themeId}>
        <PedigreeToolbar zoom={1} expanded={false} compact={false} canCompact={false} onZoomIn={noop} onZoomOut={noop} onReset={noop} onFit={noop} onToggleCompact={noop} onToggleExpand={noop} />
      </ThemeProvider>
    )
  )
}

describe('PedigreeToolbar – Name des Baums je Auftritt (Phase U)', () => {
  test('Standard: "Ansicht der Familienbande", "Ganze Familienbande zeigen"', () => {
    render('standard')
    expect(container.querySelector('[role="toolbar"]').getAttribute('aria-label')).toBe('Ansicht der Familienbande')
    expect(container.querySelector('button[aria-label="Einpassen"]').getAttribute('title')).toBe('Ganze Familienbande zeigen')
  })

  test('Berner: unverändert "Stammbaum-Ansicht", "Ganzen Stammbaum zeigen"', () => {
    render('berner')
    expect(container.querySelector('[role="toolbar"]').getAttribute('aria-label')).toBe('Stammbaum-Ansicht')
    expect(container.querySelector('button[aria-label="Einpassen"]').getAttribute('title')).toBe('Ganzen Stammbaum zeigen')
  })
})
