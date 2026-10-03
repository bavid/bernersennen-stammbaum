// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { qrSvgPath } = vi.hoisted(() => ({ qrSvgPath: vi.fn(() => ({ size: 21, path: 'M0 0h1v1h-1z' })) }))
vi.mock('../../lib/qr.js', () => ({ qrSvgPath }))

import EinladungBack from './EinladungBack.jsx'
import VisitenkarteFront from './VisitenkarteFront.jsx'
import VisitenkartenBoegen, { SEITEN } from './VisitenkartenBogen.jsx'
import { RUECKSEITE_VORGABEN, buildKartenSheets, einladungCardModel, rueckseiteModel } from '../../lib/einladungskarte.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PROFILE = {
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  logoUrl: null,
  banner: [{ position: 1, fotoUrl: '/uploads/banner.jpg', alt: 'Welpen' }],
  ansprechperson: 'Anna Berg',
  website: null,
  kontaktTelefon: null,
  kontaktEmail: 'hallo@example.org'
}
const DESIGN = {
  vorlage: 'klassisch',
  farbe: '#1f5f8b',
  kurztext: 'Training mit Herz',
  widmung: 'Für unsere Welpenkurs-Familien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: true
}
const BASE = 'https://beispiel-chronik.de'
const RUECKSEITE = { titel: 'Eure Chronik wartet', text: 'Ein Text der Plattform.', schritte: ['Scannen', 'Code eingeben'], adresse: '' }
const CODE = 'AB12-CD34-EF56'

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
  qrSvgPath.mockClear()
})

function card(patch = {}) {
  return einladungCardModel({ profile: PROFILE, design: { ...DESIGN, ...patch }, publicUrl: BASE, origin: 'http://localhost' })
}

function render(element) {
  act(() => root.render(element))
  return container.firstElementChild
}

describe('Einladungskarte – Vorderseite', () => {
  test.each(['klassisch', 'foto', 'schlicht'])('%s: die persönliche Zeile steht über dem Namen', (vorlage) => {
    const front = render(<VisitenkarteFront card={card({ vorlage })} />)
    expect(front.querySelector('.vk-widmung').textContent).toBe('Für unsere Welpenkurs-Familien')
    expect(front.classList.contains('has-widmung')).toBe(true)
    expect(front.querySelector('.vk-name').textContent).toBe('Hundeschule Pfotenglück')
  })

  test('ohne persönliche Zeile: keine leere Zeile', () => {
    const front = render(<VisitenkarteFront card={card({ widmung: '' })} />)
    expect(front.querySelector('.vk-widmung')).toBe(null)
    expect(front.classList.contains('has-widmung')).toBe(false)
  })
})

describe('Einladungskarte – Rückseite (Familie auf Pfoten)', () => {
  test('Texte der Admin-Einstellung, Code in Vierergruppen, QR nur mit dem Code hinter der Raute, Adresse automatisch', () => {
    const vorne = card()
    const back = render(<EinladungBack card={vorne} rueckseite={rueckseiteModel(RUECKSEITE, vorne)} code={CODE} />)
    expect(back.classList.contains('vk-back-einladung')).toBe(true)
    expect(back.querySelector('.vk-back-brand').textContent).toBe('Familie auf Pfoten')
    expect(back.querySelector('.vk-einladung-titel').textContent).toBe('Eure Chronik wartet')
    expect(back.querySelector('.vk-einladung-text').textContent).toBe('Ein Text der Plattform.')
    expect([...back.querySelectorAll('.vk-einladung-schritte li')].map((li) => li.textContent)).toEqual(['Scannen', 'Code eingeben'])
    expect([...back.querySelectorAll('.vk-code span')].map((span) => span.textContent)).toEqual(['AB12', 'CD34', 'EF56'])
    expect(back.querySelector('.vk-einladung-adresse').textContent).toBe('beispiel-chronik.de/v')
    expect(qrSvgPath).toHaveBeenCalledWith(`${BASE}/v#${CODE}`)
    expect(back.dataset.muster).toBeUndefined()
  })

  test('nie Farbe, Name oder Texte des Partners - die Plattform-Farben stehen fest', () => {
    const vorne = card({ farbe: '#ff00aa', kurztext: 'Partner-Kurztext' })
    const back = render(<EinladungBack card={vorne} rueckseite={rueckseiteModel(RUECKSEITE, vorne)} code={CODE} />)
    expect(back.getAttribute('style')).toBe(null)
    expect(back.outerHTML).not.toContain('#ff00aa')
    expect(back.textContent).not.toContain('Hundeschule Pfotenglück')
    expect(back.textContent).not.toContain('Partner-Kurztext')
    expect(back.textContent).not.toContain('Welpenkurs-Familien')
  })

  test('Muster: deutlich gekennzeichnet; ohne Schritte kein leerer Block; eigene Adresse aus der Einstellung', () => {
    const vorne = card()
    const back = render(
      <EinladungBack card={vorne} rueckseite={rueckseiteModel({ ...RUECKSEITE, schritte: [], adresse: 'pfoten.example/v' }, vorne)} code="DEMO-MUST-0001" muster />
    )
    expect(back.dataset.muster).toBe('true')
    expect(back.querySelector('.vk-muster').textContent).toContain('Muster')
    expect(back.querySelector('.vk-einladung-schritte')).toBe(null)
    expect(back.querySelector('.vk-einladung-adresse').textContent).toBe('pfoten.example/v')
  })

  test('Vorgaben: "So geht\'s" mit den drei Schritten', () => {
    const vorne = card()
    const back = render(<EinladungBack card={vorne} rueckseite={rueckseiteModel(RUECKSEITE_VORGABEN, vorne)} code={CODE} />)
    expect(back.querySelectorAll('.vk-einladung-schritte li')).toHaveLength(3)
    expect(back.textContent).toContain('So geht’s')
  })
})

describe('Einladungskarten – Bögen nach Kartenzahl', () => {
  test('angebrochener Bogen: leere Plätze vorne wie hinten, jede Rückseite mit dem Code ihrer Karte', () => {
    const vorne = card()
    const rueckseite = rueckseiteModel(RUECKSEITE, vorne)
    const codes = ['AAAA-0000-0001', 'AAAA-0000-0002', 'AAAA-0000-0003']
    const sheets = render(
      <VisitenkartenBoegen
        sheets={buildKartenSheets({ count: 3, codes })}
        card={vorne}
        seiten={SEITEN.beide}
        renderBack={(back) => <EinladungBack card={vorne} rueckseite={rueckseite} code={back.code} />}
      />
    )
    const [front, backSheet] = sheets.querySelectorAll('.vk-sheet')
    expect(front.querySelectorAll('.vk-front')).toHaveLength(3)
    expect(front.querySelectorAll('.vk-slot-leer')).toHaveLength(7)
    expect(backSheet.querySelectorAll('.vk-back-einladung')).toHaveLength(3)
    expect([...backSheet.querySelectorAll('.vk-sheet-grid > *')].slice(0, 4).map((el) => el.querySelector('.vk-code')?.getAttribute('aria-label') ?? 'leer')).toEqual([
      'Code AAAA-0000-0002',
      'Code AAAA-0000-0001',
      'leer',
      'Code AAAA-0000-0003'
    ])
  })
})
