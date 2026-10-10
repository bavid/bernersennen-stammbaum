// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import AdminAnfrageGeschaeft from './AdminAnfrageGeschaeft.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const BASE = {
  id: 4,
  name: 'Lotte Beispiel',
  email: 'lotte@example.org',
  geschaeft: {
    art: 'hundesalon',
    ort: 'Berlin',
    telefon: '030 1234567',
    webseite: 'https://salon.example.org/',
    bundesweit: true,
    termine: [
      { datum: '2026-10-13', zeitfenster: 'vormittag', kanal: 'telefon' },
      { datum: '2026-10-14', zeitfenster: 'abend', kanal: null }
    ],
    bestaetigt: null
  }
}

async function render(anfrage, onConfirm = vi.fn().mockResolvedValue(true)) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminAnfrageGeschaeft anfrage={anfrage} onConfirm={onConfirm} />))
  return onConfirm
}

const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))

describe('AdminAnfrageGeschaeft', () => {
  test('zeigt Angaben und Vorschläge; Bestätigen meldet Index und Notiz', async () => {
    const onConfirm = await render(BASE)
    expect(container.querySelector('.admin-anfrage-meta').textContent).toContain('Hundesalon · Berlin · deutschlandweit tätig · Tel. 030 1234567')
    const items = [...container.querySelectorAll('.admin-anfrage-termine li')].map((li) => li.textContent)
    expect(items[0]).toContain('Dienstag, 13.10.2026 · Vormittag (9–12 Uhr) · Telefon')
    expect(button('E-Mail-Text kopieren')).toBeUndefined()
    await act(async () => button('Bestätigen').click())
    expect(onConfirm).toHaveBeenCalledWith(0, '')
  })

  test('bestätigter Termin: Kennzeichen und E-Mail-Text zum Kopieren', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    await render({ ...BASE, geschaeft: { ...BASE.geschaeft, bestaetigt: { index: 1, notiz: null, at: '2026-10-10 10:00:00' } } })
    expect(container.querySelector('li.is-bestaetigt').textContent).toContain('bestätigt')
    await act(async () => button('E-Mail-Text kopieren').click())
    const text = writeText.mock.calls[0][0]
    expect(text).toMatch(/^Betreff: Euer Termin mit /)
    expect(text).toContain('Mittwoch, 14.10.2026 · Abend (18–20 Uhr)')
    expect(button('Kopiert')).toBeDefined()
  })
})
