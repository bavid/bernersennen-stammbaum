// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { config, einladungskarte, saveEinladungskarte, qrSvgPath } = vi.hoisted(() => ({
  config: vi.fn(),
  einladungskarte: vi.fn(),
  saveEinladungskarte: vi.fn(),
  qrSvgPath: vi.fn(() => ({ size: 21, path: 'M0 0h1v1h-1z' }))
}))
vi.mock('../api', () => ({ api: { config, admin: { einladungskarte, saveEinladungskarte } } }))
vi.mock('../lib/qr.js', () => ({ qrSvgPath }))

import AdminEinladungskarte from './AdminEinladungskarte.jsx'
import { RUECKSEITE_VORGABEN } from '../lib/einladungskarte.js'

// Admin-Einstellung "Einladungskarte – Rückseite": Titel, Text, bis zu drei Schritte und die gezeigte Adresse - mit
// Live-Vorschau der Rückseite (dieselbe Komponente wie im Designer der Partner, mit Muster-Code).
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const STORED = { titel: 'Eure Chronik wartet', text: 'Ein Text der Plattform.', schritte: ['Scannen', 'Code eingeben'], adresse: '' }

let container
let root

beforeEach(() => {
  config.mockResolvedValue({ publicUrl: 'https://beispiel-chronik.de' })
  einladungskarte.mockResolvedValue({ rueckseite: STORED, vorgaben: RUECKSEITE_VORGABEN })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  for (const mock of [config, einladungskarte, saveEinladungskarte]) mock.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminEinladungskarte />))
}

const field = (id) => container.querySelector(`#admin-einladung-${id}`)
const preview = () => container.querySelector('.admin-einladung-preview .vk-back-einladung')
const button = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(text))

async function type(element, value) {
  const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  await act(async () => {
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit() {
  await act(async () => container.querySelector('form').requestSubmit())
}

describe('AdminEinladungskarte', () => {
  test('lädt die Rückseite in die Felder und zeigt sie als Vorschau mit Muster-Code', async () => {
    await render()
    expect(container.querySelector('h2').textContent).toBe('Einladungskarte – Rückseite')
    expect(field('titel').value).toBe('Eure Chronik wartet')
    expect(field('schritt1').value).toBe('Scannen')
    expect(field('schritt3').value).toBe('')
    expect(field('adresse').getAttribute('placeholder')).toBe('beispiel-chronik.de/v')
    expect(preview().querySelector('.vk-einladung-titel').textContent).toBe('Eure Chronik wartet')
    expect(preview().dataset.muster).toBe('true')
    expect(preview().querySelector('.vk-einladung-adresse').textContent).toBe('beispiel-chronik.de/v')
  })

  test('Vorschau folgt jeder Eingabe; leere Schritte fallen weg', async () => {
    await render()
    await type(field('titel'), 'Neu: eure Chronik')
    await type(field('schritt2'), '')
    await type(field('adresse'), 'pfoten.example/v')
    expect(preview().querySelector('.vk-einladung-titel').textContent).toBe('Neu: eure Chronik')
    expect([...preview().querySelectorAll('.vk-einladung-schritte li')].map((li) => li.textContent)).toEqual(['Scannen'])
    expect(preview().querySelector('.vk-einladung-adresse').textContent).toBe('pfoten.example/v')
  })

  test('speichert die ganze Rückseite und übernimmt die gesäuberte Antwort', async () => {
    saveEinladungskarte.mockImplementation(async (payload) => ({ rueckseite: { ...payload, adresse: 'pfoten.example/v' }, vorgaben: RUECKSEITE_VORGABEN }))
    await render()
    await type(field('schritt3'), 'Loslegen')
    await type(field('adresse'), 'https://pfoten.example/v/')
    await submit()
    expect(saveEinladungskarte).toHaveBeenCalledWith({ ...STORED, schritte: ['Scannen', 'Code eingeben', 'Loslegen'], adresse: 'https://pfoten.example/v/' })
    expect(field('adresse').value).toBe('pfoten.example/v')
    expect(container.querySelector('[role="status"]').textContent).toBe('Gespeichert.')
  })

  test('Titel und Text sind Pflicht - ohne sie geht nichts raus, der Fokus springt zum Feld', async () => {
    await render()
    await type(field('titel'), '  ')
    await submit()
    expect(saveEinladungskarte).not.toHaveBeenCalled()
    expect(field('titel').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field('titel'))
  })

  test('Fehler vom Server stehen am Feld', async () => {
    const err = Object.assign(new Error('Die Adresse bitte ohne Leerzeichen angeben.'), { status: 400, details: { feld: 'adresse' } })
    saveEinladungskarte.mockRejectedValue(err)
    await render()
    await type(field('adresse'), 'nicht gut')
    await submit()
    expect(container.querySelector('#admin-einladung-adresse-error').textContent).toContain('ohne Leerzeichen')
    expect(document.activeElement).toBe(field('adresse'))
  })

  test('ein Fehler an einem Schritt trifft dessen Feld - auch wenn ein Feld davor leer ist', async () => {
    const err = Object.assign(new Error('Schritt 3: bitte nur reinen Text (kein HTML).'), { status: 400, details: { feld: 'schritt3' } })
    saveEinladungskarte.mockRejectedValue(err)
    await render()
    await type(field('schritt1'), '')
    await type(field('schritt3'), '<b>Fett</b>')
    await submit()
    expect(saveEinladungskarte).toHaveBeenCalledWith(expect.objectContaining({ schritte: ['', 'Code eingeben', '<b>Fett</b>'] }))
    expect(container.querySelector('#admin-einladung-schritt3-error').textContent).toContain('Schritt 3')
    expect(document.activeElement).toBe(field('schritt3'))
  })

  test('"Vorgaben einsetzen" füllt die Felder mit den Vorgaben (gespeichert wird erst mit "Speichern")', async () => {
    await render()
    await act(async () => button('Vorgaben einsetzen').click())
    expect(field('titel').value).toBe(RUECKSEITE_VORGABEN.titel)
    expect(field('schritt3').value).toBe(RUECKSEITE_VORGABEN.schritte[2])
    expect(saveEinladungskarte).not.toHaveBeenCalled()
  })
})
