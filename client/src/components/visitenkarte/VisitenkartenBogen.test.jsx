// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../lib/qr.js', () => ({ qrSvgPath: () => ({ size: 21, path: 'M0 0h1v1h-1z' }) }))

import VisitenkartenBoegen, { SEITEN, VK_PRINT_BODY_CLASS, VisitenkartenDruck } from './VisitenkartenBogen.jsx'
import KombiBack from './KombiBack.jsx'
import { cardModel } from '../../lib/visitenkarte.js'
import { RUECKSEITE_VORGABEN, buildKartenSheets, rueckseiteModel } from '../../lib/einladungskarte.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CARD = cardModel({
  profile: { slug: 'wiesengrund', name: 'Hundeschule Wiesengrund', logoUrl: null, banner: [] },
  design: {
    karte: 'kombi',
    vorlage: 'klassisch',
    farbe: '#2a6f4e',
    kurztext: 'Gemeinsam lernen',
    widmung: '',
    zeigeAnsprechperson: false,
    zeigeWebsite: false,
    zeigeTelefon: false,
    zeigeEmail: false
  },
  publicUrl: 'https://beispiel-chronik.de',
  origin: 'http://localhost'
})
const codes = (count) => Array.from({ length: count }, (_, index) => `K${String(index).padStart(3, '0')}-AAAA-BBBB`)
const BACK = rueckseiteModel(RUECKSEITE_VORGABEN, CARD)
const kombiBack = (entry) => <KombiBack card={CARD} rueckseite={BACK} code={entry.code} muster />

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(element) {
  act(() => root.render(element))
}

const sheetsOf = (scope, side) => [...scope.querySelectorAll(`.vk-sheet-${side}`)]

describe('VisitenkartenBoegen', () => {
  test('je Bogen 10 Vorderseiten und danach 10 Rückseiten, mit Schnittmarken und Beschriftung', () => {
    render(<VisitenkartenBoegen sheets={buildKartenSheets({ count: 20, codes: codes(20) })} card={CARD} />)
    const all = [...container.querySelectorAll('.vk-sheet')]
    expect(all.map((sheet) => sheet.dataset.seite)).toEqual(['vorne', 'hinten', 'vorne', 'hinten'])
    expect(all.map((sheet) => sheet.getAttribute('aria-label'))).toEqual([
      'Bogen 1 von 2, Vorderseite',
      'Bogen 1 von 2, Rückseite',
      'Bogen 2 von 2, Vorderseite',
      'Bogen 2 von 2, Rückseite'
    ])
    for (const sheet of all) {
      expect(sheet.querySelectorAll('.vk-sheet-grid > .vk-card')).toHaveLength(10)
      expect(sheet.querySelectorAll('.vk-cropmarks line')).toHaveLength(18)
    }
    expect(sheetsOf(container, 'vorne')[0].querySelectorAll('.vk-front')).toHaveLength(10)
  })

  test('Rückseiten laufen je Reihe gespiegelt - jeder Code steht hinter seiner Karte', () => {
    render(<VisitenkartenBoegen sheets={buildKartenSheets({ count: 10, codes: codes(10) })} card={CARD} renderBack={kombiBack} />)
    const [back] = sheetsOf(container, 'hinten')
    const order = [...back.querySelectorAll('.vk-code')].map((code) => code.getAttribute('aria-label').replace('Einladungscode ', ''))
    const expected = [1, 0, 3, 2, 5, 4, 7, 6, 9, 8].map((index) => codes(10)[index])
    expect(order).toEqual(expected)
  })

  test('ohne renderBack die Rückseite mit dem Portal; renderBack zeichnet die Rückseite der gewählten Kombination', () => {
    render(<VisitenkartenBoegen sheets={buildKartenSheets({ count: 3, codes: [] })} card={CARD} />)
    expect(sheetsOf(container, 'hinten')[0].querySelectorAll('.vk-back-portal')).toHaveLength(3)
    render(<VisitenkartenBoegen sheets={buildKartenSheets({ count: 3, codes: codes(3) })} card={CARD} renderBack={kombiBack} />)
    const [back] = sheetsOf(container, 'hinten')
    expect(back.querySelectorAll('.vk-back-kombi')).toHaveLength(3)
    expect(back.querySelectorAll('.vk-muster')).toHaveLength(3)
    expect(back.querySelectorAll('.vk-slot-leer')).toHaveLength(7)
  })

  test('nur Vorder- oder nur Rückseiten (Wenden von Hand), total für die Vorschau des ersten Bogens', () => {
    const sheets = buildKartenSheets({ count: 30, codes: [] })
    render(<VisitenkartenBoegen sheets={sheets} card={CARD} seiten={SEITEN.vorne} />)
    expect(sheetsOf(container, 'vorne')).toHaveLength(3)
    expect(sheetsOf(container, 'hinten')).toHaveLength(0)
    render(<VisitenkartenBoegen sheets={sheets} card={CARD} seiten={SEITEN.hinten} />)
    expect(sheetsOf(container, 'vorne')).toHaveLength(0)
    expect(sheetsOf(container, 'hinten')).toHaveLength(3)
    render(<VisitenkartenBoegen sheets={sheets.slice(0, 1)} total={3} card={CARD} />)
    expect(container.querySelector('.vk-sheet').getAttribute('aria-label')).toBe('Bogen 1 von 3, Vorderseite')
  })
})

describe('VisitenkartenDruck', () => {
  test('hängt die Druckfassung direkt in <body> und setzt die Druck-Klasse, solange die Seite offen ist', () => {
    render(
      <VisitenkartenDruck>
        <VisitenkartenBoegen sheets={buildKartenSheets({ count: 10, codes: [] })} card={CARD} />
      </VisitenkartenDruck>
    )
    const print = document.body.querySelector(':scope > .vk-print')
    expect(print).not.toBe(null)
    expect(container.contains(print)).toBe(false)
    expect(print.querySelectorAll('.vk-sheet')).toHaveLength(2)
    expect(document.body.classList.contains(VK_PRINT_BODY_CLASS)).toBe(true)

    render(<p>weg</p>)
    expect(document.body.querySelector(':scope > .vk-print')).toBe(null)
    expect(document.body.classList.contains(VK_PRINT_BODY_CLASS)).toBe(false)
  })
})
