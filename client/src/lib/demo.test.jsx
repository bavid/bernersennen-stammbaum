// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import { ADMIN_VIEW_HINT, DEMO_HINT, DemoProvider, isReadOnly, readOnlyModeOf, useIsAdminView, useIsDemo, useReadOnlyHint } from './demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
})

function Probe({ demoHint }) {
  const readOnly = useIsDemo()
  const adminView = useIsAdminView()
  const hint = useReadOnlyHint(demoHint)
  return (
    <p>
      {String(readOnly)}|{String(adminView)}|{hint}
    </p>
  )
}

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(ui))
  return container.textContent
}

describe('lib/demo – schreibgeschützte Sitzungen (Demo und Admin-Ansicht)', () => {
  test('isReadOnly: Demo oder Admin-Ansicht, sonst nicht', () => {
    expect(isReadOnly({ isDemo: true })).toBe(true)
    expect(isReadOnly({ adminView: true })).toBe(true)
    expect(isReadOnly({ isDemo: false })).toBe(false)
    expect(isReadOnly(undefined)).toBe(false)
  })

  test('readOnlyModeOf: Boolean bleibt "Demo ja/nein", ein me-Objekt bringt beide Kennzeichen', () => {
    expect(readOnlyModeOf(true)).toEqual({ isDemo: true, isAdminView: false })
    expect(readOnlyModeOf(false)).toEqual({ isDemo: false, isAdminView: false })
    expect(readOnlyModeOf({ isDemo: false, adminView: true })).toEqual({ isDemo: false, isAdminView: true })
    expect(readOnlyModeOf({ isDemo: true })).toEqual({ isDemo: true, isAdminView: false })
  })

  test('ohne Provider: nicht schreibgeschützt, Demo-Hinweis als Standard', async () => {
    expect(await render(<Probe />)).toBe(`false|false|${DEMO_HINT}`)
  })

  test('Demo (Boolean wie bisher): gesperrt, Demo-Text der Komponente bleibt', async () => {
    const text = await render(
      <DemoProvider value={true}>
        <Probe demoHint="In der Demo nur als Vorschau." />
      </DemoProvider>
    )
    expect(text).toBe('true|false|In der Demo nur als Vorschau.')
  })

  test('Admin-Ansicht: gesperrt wie die Demo, aber mit dem Admin-Hinweis - auch statt eines eigenen Demo-Texts', async () => {
    const text = await render(
      <DemoProvider value={{ isDemo: false, adminView: true }}>
        <Probe demoHint="In der Demo nur als Vorschau." />
      </DemoProvider>
    )
    expect(text).toBe(`true|true|${ADMIN_VIEW_HINT}`)
    expect(ADMIN_VIEW_HINT).toBe('In der Admin-Ansicht nicht möglich.')
  })
})
