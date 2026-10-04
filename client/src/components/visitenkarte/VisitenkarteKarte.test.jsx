// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { qrSvgPath } = vi.hoisted(() => ({ qrSvgPath: vi.fn(() => ({ size: 21, path: 'M0 0h1v1h-1z' })) }))
vi.mock('../../lib/qr.js', () => ({ qrSvgPath }))

import VisitenkarteFront from './VisitenkarteFront.jsx'
import VisitenkarteBack from './VisitenkarteBack.jsx'
import KombiBack from './KombiBack.jsx'
import { cardModel, maskPendingAddress } from '../../lib/visitenkarte.js'
import { RUECKSEITE_VORGABEN, rueckseiteModel } from '../../lib/einladungskarte.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PROFILE = {
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  logoUrl: '/partner-media/logo.png',
  banner: [{ position: 1, fotoUrl: '/uploads/banner.jpg', alt: 'Welpen' }],
  ansprechperson: 'Anna Berg',
  website: 'https://example.org/pfotenglueck',
  kontaktTelefon: '040 123456',
  kontaktEmail: null
}
const DESIGN = {
  karte: 'kombi',
  vorlage: 'klassisch',
  farbe: '#1f5f8b',
  kurztext: 'Welpenkurse und Hundetraining',
  widmung: '',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: true
}
const BASE = 'https://beispiel-chronik.de'

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

function card(designPatch = {}, profilePatch = {}) {
  return cardModel({ profile: { ...PROFILE, ...profilePatch }, design: { ...DESIGN, ...designPatch }, publicUrl: BASE, origin: 'http://localhost' })
}

function render(element) {
  act(() => root.render(element))
  return container.firstElementChild
}

describe('VisitenkarteFront', () => {
  test('Klassisch: Logo links, Name, Kurztext, Ansprechperson und Kontaktzeile, Farbe als CSS-Variable', () => {
    const front = render(<VisitenkarteFront card={card()} />)
    expect(front.dataset.vorlage).toBe('klassisch')
    expect(front.getAttribute('aria-label')).toBe('Vorderseite (Klassisch)')
    expect(front.querySelector('.vk-klassisch-logo img').getAttribute('src')).toBe('/partner-media/logo.png')
    expect(front.querySelector('.vk-name').textContent).toBe('Hundeschule Pfotenglück')
    expect(front.querySelector('.vk-kurztext').textContent).toBe('Welpenkurse und Hundetraining')
    expect(front.querySelector('.vk-person').textContent).toBe('Anna Berg')
    expect([...front.querySelectorAll('.vk-kontakte li')].map((li) => li.textContent)).toEqual(['example.org/pfotenglueck', '040 123456'])
    expect(front.style.getPropertyValue('--vk-farbe')).toBe('#1f5f8b')
    expect(front.style.getPropertyValue('--vk-on')).toBe('#ffffff')
    expect(front.querySelector('.vk-qr')).toBe(null)
  })

  test('Klassisch ohne Logo: Monogramm aus dem Namen', () => {
    const front = render(<VisitenkarteFront card={card({}, { logoUrl: null })} />)
    expect(front.querySelector('img')).toBe(null)
    expect(front.querySelector('.vk-monogram').textContent).toBe('HP')
  })

  test('Foto: Bannerfoto mit Schleier, Logo im Kästchen, Name darüber', () => {
    const front = render(<VisitenkarteFront card={card({ vorlage: 'foto' })} />)
    expect(front.dataset.vorlage).toBe('foto')
    expect(front.querySelector('.vk-foto-bild').getAttribute('src')).toBe('/uploads/banner.jpg')
    expect(front.querySelector('.vk-scrim')).not.toBe(null)
    expect(front.querySelector('.vk-foto-logo img').getAttribute('src')).toBe('/partner-media/logo.png')
    expect(front.querySelector('.vk-foto-text .vk-name').textContent).toBe('Hundeschule Pfotenglück')
  })

  test('Foto ohne Bannerfoto wird Klassisch', () => {
    const front = render(<VisitenkarteFront card={card({ vorlage: 'foto' }, { banner: [] })} />)
    expect(front.dataset.vorlage).toBe('klassisch')
    expect(front.querySelector('.vk-foto-bild')).toBe(null)
  })

  test('Schlicht: Farbband mit dem Namen, ohne Logo; ohne Ansprechperson-Schalter kein Name der Person', () => {
    const front = render(<VisitenkarteFront card={card({ vorlage: 'schlicht', zeigeAnsprechperson: false })} />)
    expect(front.dataset.vorlage).toBe('schlicht')
    expect(front.querySelector('.vk-band .vk-name').textContent).toBe('Hundeschule Pfotenglück')
    expect(front.querySelector('img')).toBe(null)
    expect(front.querySelector('.vk-person')).toBe(null)
  })
})

describe('VisitenkarteBack', () => {
  test('QR-Code zum Portal und die kurze Adresse', () => {
    const back = render(<VisitenkarteBack card={card()} />)
    expect(back.classList.contains('vk-back-portal')).toBe(true)
    expect(qrSvgPath).toHaveBeenCalledWith(`${BASE}/p/hundeschule-pfotenglueck`)
    expect(back.querySelector('.vk-qr').getAttribute('aria-label')).toBe('QR-Code, öffnet beispiel-chronik.de/p/hundeschule-pfotenglueck')
    expect(back.querySelector('.vk-back-url').textContent).toBe('beispiel-chronik.de/p/hundeschule-pfotenglueck')
    expect(back.querySelector('.vk-code')).toBe(null)
  })
})

describe('KombiBack (Feedback-Runde)', () => {
  const back = (patch = {}) => rueckseiteModel(RUECKSEITE_VORGABEN, patch.card || card())

  test('Portal und Einladungscode nebeneinander: zwei QR-Codes mit Namen, Code in Vierergruppen, Titel und Text der Plattform', () => {
    const element = render(<KombiBack card={card()} rueckseite={back()} code="ABCD-EFGH-JKLM" />)
    expect(element.classList.contains('vk-back-kombi')).toBe(true)
    expect([...element.querySelectorAll('.vk-kombi-label')].map((label) => label.textContent)).toEqual(['Unser Portal', 'Euer Einladungscode'])
    expect(element.querySelector('.vk-einladung-titel').textContent).toBe(RUECKSEITE_VORGABEN.titel)
    expect(element.querySelector('.vk-kombi-text').textContent).toBe(RUECKSEITE_VORGABEN.text)
    const targets = qrSvgPath.mock.calls.map(([url]) => url)
    expect(targets).toContain(`${BASE}/p/hundeschule-pfotenglueck`)
    expect(targets).toContain(`${BASE}/v#ABCD-EFGH-JKLM`)
    const voucher = new URL(`${BASE}/v#ABCD-EFGH-JKLM`)
    expect([voucher.pathname, voucher.search]).toEqual(['/v', ''])
    expect([...element.querySelectorAll('.vk-code span')].map((span) => span.textContent)).toEqual(['ABCD', 'EFGH', 'JKLM'])
    expect(element.querySelector('.vk-code').getAttribute('aria-label')).toBe('Einladungscode ABCD-EFGH-JKLM')
    expect([...element.querySelectorAll('.vk-qr')].every((qr) => !qr.getAttribute('aria-label').includes('ABCD'))).toBe(true)
    expect(element.textContent).not.toMatch(/Gutschein/)
    expect(element.querySelector('.vk-muster')).toBe(null)
  })

  test('Muster: deutlich gekennzeichnet, auch für Screenreader', () => {
    const element = render(<KombiBack card={card()} rueckseite={back()} code="DEMO-MUST-0001" muster />)
    expect(element.dataset.muster).toBe('true')
    expect(element.getAttribute('aria-label')).toBe('Rückseite mit Portal und Einladungscode (Muster)')
    expect(element.querySelector('.vk-muster').textContent).toBe('Muster – Beispiel-Code, lässt sich nicht einlösen')
  })

  test('ohne öffentliche Adresse: "Adresse folgt" statt eines technischen Hosts', () => {
    const masked = maskPendingAddress(cardModel({ profile: PROFILE, design: DESIGN, publicUrl: null, origin: 'http://10.0.0.5:3010' }))
    const element = render(<KombiBack card={masked} rueckseite={back({ card: masked })} code="DEMO-MUST-0001" muster />)
    expect(element.querySelector('.vk-kombi-sub').textContent).toBe('Adresse folgt')
    expect(element.textContent).not.toContain('10.0.0.5')
  })
})
