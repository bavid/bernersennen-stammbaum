// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { setShelterShare } = vi.hoisted(() => ({ setShelterShare: vi.fn() }))
vi.mock('../api', () => ({ api: { setShelterShare } }))

import ShelterSharePanel from './ShelterSharePanel.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const dog = (overrides = {}) => ({
  id: 10,
  name: 'Nele',
  name_unbekannt: false,
  shelterShare: { shelterName: 'Tierheim Sonnenhang', enabled: true, storyConsent: false, ...overrides }
})

function Wrapper({ isDemo = false, ...props }) {
  return (
    <DemoProvider value={isDemo}>
      <ShelterSharePanel dog={dog()} onChange={() => {}} {...props} />
    </DemoProvider>
  )
}

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<Wrapper {...props} />))
  return container
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  setShelterShare.mockReset()
})

function checkboxes() {
  return [...container.querySelectorAll('input[type="checkbox"]')]
}

describe('ShelterSharePanel', () => {
  test('die Überschrift sagt auf einen Blick, ob das Tierheim mitliest', async () => {
    await render()
    expect(container.querySelector('h2').textContent).toBe('Tierheim Sonnenhang liest mit')
    act(() => root.unmount())
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const off = { id: 10, name: 'Nele', name_unbekannt: false, shelterShare: { shelterName: 'Tierheim Sonnenhang', enabled: false, storyConsent: false } }
    await act(async () => root.render(<Wrapper dog={off} />))
    expect(container.querySelector('h2').textContent).toBe('Tierheim Sonnenhang liest nicht mit')
  })

  test('zeigt den Namen des Tierheims in beiden Checkbox-Beschriftungen', async () => {
    await render()
    expect(container.textContent).toContain('Tierheim Sonnenhang darf mitlesen')
    expect(container.textContent).toContain(
      'Tierheim Sonnenhang darf Nele mit Foto und der neuesten nicht privaten Erinnerung öffentlich auf seiner Portalseite zeigen (Happy End)'
    )
  })

  test('erklärt "darf mitlesen" mit einem Hinweis, was das Tierheim dadurch sieht (informed consent)', async () => {
    await render()
    expect(container.textContent).toContain('Tierheim Sonnenhang sieht Nele und alle nicht privaten Erinnerungen (nur lesen und Grüße schreiben)')
  })

  test('spiegelt den aktuellen Stand (enabled/storyConsent) in den Checkboxen', async () => {
    await render({ dog: dog({ enabled: true, storyConsent: true }) })
    const [mitlesen, storyConsent] = checkboxes()
    expect(mitlesen.checked).toBe(true)
    expect(storyConsent.checked).toBe(true)
  })

  test('Abschalten von "darf mitlesen" ruft api.setShelterShare mit enabled:false und storyConsent:false', async () => {
    setShelterShare.mockResolvedValue({ shelterName: 'Tierheim Sonnenhang', enabled: false, storyConsent: false })
    await render({ dog: dog({ enabled: true, storyConsent: true }) })
    const [mitlesen] = checkboxes()

    await act(async () => mitlesen.click())

    expect(setShelterShare).toHaveBeenCalledWith(10, { enabled: false, storyConsent: false })
  })

  test('die Happy-End-Checkbox ist gesperrt, solange "darf mitlesen" aus ist', async () => {
    await render({ dog: dog({ enabled: false, storyConsent: false }) })
    const [, storyConsent] = checkboxes()
    expect(storyConsent.disabled).toBe(true)
  })

  test('Anhaken der Happy-End-Checkbox ruft api.setShelterShare mit storyConsent:true auf', async () => {
    setShelterShare.mockResolvedValue({ shelterName: 'Tierheim Sonnenhang', enabled: true, storyConsent: true })
    const onChange = vi.fn()
    await render({ dog: dog({ enabled: true, storyConsent: false }), onChange })
    const [, storyConsent] = checkboxes()

    await act(async () => storyConsent.click())

    expect(setShelterShare).toHaveBeenCalledWith(10, { enabled: true, storyConsent: true })
    expect(onChange).toHaveBeenCalledWith({ shelterName: 'Tierheim Sonnenhang', enabled: true, storyConsent: true })
  })

  test('bei einem Fehler geht die Checkbox zurück und ein Toast (Kontext-Fallback) verschluckt nichts stumm', async () => {
    setShelterShare.mockRejectedValue(new Error('Netzwerkfehler'))
    await render({ dog: dog({ enabled: true, storyConsent: false }) })
    const [mitlesen] = checkboxes()

    await act(async () => mitlesen.click())

    expect(checkboxes()[0].checked).toBe(true)
  })

  test('in der Demo sind beide Checkboxen gesperrt', async () => {
    await render({ isDemo: true, dog: dog({ enabled: true, storyConsent: true }) })
    const [mitlesen, storyConsent] = checkboxes()
    expect(mitlesen.disabled).toBe(true)
    expect(storyConsent.disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })
})
