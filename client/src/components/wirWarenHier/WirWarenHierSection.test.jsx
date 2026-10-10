// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  wwhOrt: vi.fn(),
  listDogs: vi.fn(),
  wwhKontaktOffen: vi.fn(),
  wwhCheckIn: vi.fn(),
  wwhSetZeigeMich: vi.fn(),
  wwhWithdraw: vi.fn(),
  wwhKontakt: vi.fn(),
  wwhKontaktAnnehmen: vi.fn(),
  wwhKontaktAblehnen: vi.fn(),
  wwhKontaktZurueck: vi.fn(),
  listTimeline: vi.fn(),
  wwhPin: vi.fn(),
  wwhUnpin: vi.fn()
}))
vi.mock('../../api', () => ({ api: mocks }))

import WirWarenHierSection from './WirWarenHierSection.jsx'
import { button, choose, cleanupUi, click, renderUi } from './testUtils.jsx'
import { setLang } from '../../lib/i18n/index.js'

const ORT = { id: 7, name: 'Hundeschule Pfotenglück', typ: 'hundeschule' }
const partner = { id: 7, name: 'Hundeschule Pfotenglück' }
const dogs = [
  { id: 11, name: 'Benno', can_edit: 1 },
  { id: 12, name: 'Wilma', can_edit: 1 },
  { id: 99, name: 'Flocke', can_edit: 0 }
]
const wartend = { id: 1, dogId: 11, tierName: 'Benno', status: 'offen', zeigeMich: false, erinnerungen: [] }
const frei = { ...wartend, status: 'bestaetigt' }
const pepper = { checkinId: 40, tierName: 'Pepper', tierart: 'hund', fotoUrl: null, erinnerungen: [{ titel: 'Erste Stunde', datum: '2026-09-01' }] }

function setup({ eigene = [], andere = [], wishes = { an: [], von: [] } } = {}) {
  mocks.wwhOrt.mockResolvedValue({ ort: ORT, eigene, andere })
  mocks.listDogs.mockResolvedValue(dogs)
  mocks.wwhKontaktOffen.mockResolvedValue(wishes)
}

afterEach(() => {
  cleanupUi()
  for (const mock of Object.values(mocks)) mock.mockReset()
  setLang('de')
})

describe('WirWarenHierSection – anmelden', () => {
  test('Tier wählen und anmelden: danach „Wartet auf Freigabe durch {Ort}“, Status wird angesagt', async () => {
    setup()
    const container = await renderUi(<WirWarenHierSection partner={partner} />)
    const select = container.querySelector('select')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Benno', 'Wilma'])
    expect(container.querySelector('label[for="' + select.id + '"]').textContent).toBe('Welches Tier war dabei?')

    await choose(select, 12)
    mocks.wwhCheckIn.mockResolvedValue({ id: 2, status: 'offen' })
    mocks.wwhOrt.mockResolvedValue({ ort: ORT, eigene: [{ ...wartend, id: 2, dogId: 12, tierName: 'Wilma' }], andere: [] })
    await click(button(container, 'Hier anmelden'))

    expect(mocks.wwhCheckIn).toHaveBeenCalledWith(7, 12)
    expect(container.textContent).toContain('Wartet auf Freigabe durch Hundeschule Pfotenglück')
    expect(container.querySelector('[role="status"]').textContent).toBe('Angemeldet – Hundeschule Pfotenglück gibt die Anmeldung frei.')
  })

  test('Fehler 429 wird verständlich angezeigt', async () => {
    setup()
    const container = await renderUi(<WirWarenHierSection partner={partner} />)
    mocks.wwhCheckIn.mockRejectedValue(Object.assign(new Error('Fehler 429'), { status: 429 }))
    await click(button(container, 'Hier anmelden'))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Gerade zu viele Versuche – bitte später noch einmal.')
  })

  test('Server-Meldung (403) bleibt stehen', async () => {
    setup()
    const container = await renderUi(<WirWarenHierSection partner={partner} />)
    mocks.wwhCheckIn.mockRejectedValue(Object.assign(new Error('In der Demo nicht möglich.'), { status: 403 }))
    await click(button(container, 'Hier anmelden'))
    expect(container.querySelector('[role="alert"]').textContent).toBe('In der Demo nicht möglich.')
  })
})

describe('WirWarenHierSection – hier zeigen und andere', () => {
  test('Schalter „Hier zeigen“ erklärt in einem Satz, was andere sehen, und schaltet', async () => {
    setup({ eigene: [frei] })
    const container = await renderUi(<WirWarenHierSection partner={partner} />)
    const toggle = container.querySelector('input[role="switch"]')
    expect(toggle.checked).toBe(false)
    expect(toggle.closest('label').textContent).toContain('Hier zeigen')
    expect(toggle.closest('label').textContent).toContain('nur Name und Foto deines Tieres')
    expect(toggle.closest('label').textContent).toContain('jederzeit ausschalten')

    mocks.wwhSetZeigeMich.mockResolvedValue({ id: 1, zeigeMich: true })
    mocks.wwhOrt.mockResolvedValue({ ort: ORT, eigene: [{ ...frei, zeigeMich: true }], andere: [] })
    await click(toggle)
    expect(mocks.wwhSetZeigeMich).toHaveBeenCalledWith(1, true)
    expect(container.querySelector('input[role="switch"]').checked).toBe(true)
    expect(container.querySelector('[role="status"]').textContent).toBe('Benno wird hier gezeigt.')
  })

  test('ohne Freigabe: Erklärung statt der anderen Tiere', async () => {
    setup({ eigene: [wartend] })
    const container = await renderUi(<WirWarenHierSection partner={partner} />)
    expect(container.textContent).toContain('Sobald der Ort euch freigegeben hat, seht ihr hier, wer noch da war.')
    expect(container.textContent).not.toContain('Pepper')
  })

  test('mit Freigabe: andere Tiere mit angehefteter Erinnerung', async () => {
    setup({ eigene: [frei], andere: [pepper] })
    const container = await renderUi(<WirWarenHierSection partner={partner} />)
    expect(container.textContent).toContain('Wer noch hier war')
    expect(container.textContent).toContain('Pepper')
    expect(container.textContent).toContain('Erste Stunde')
    expect(button(container, 'Kontakt zu Pepper anfragen')).toBeTruthy()
  })
})

describe('WirWarenHierSection – Demo und Englisch', () => {
  test('Demo: nur lesen, Knöpfe gesperrt, Hinweis', async () => {
    setup({ eigene: [frei], andere: [pepper] })
    const container = await renderUi(<WirWarenHierSection partner={partner} />, { isDemo: true })
    expect(button(container, 'Hier anmelden').disabled).toBe(true)
    expect(container.querySelector('input[role="switch"]').disabled).toBe(true)
    expect(button(container, 'Kontakt zu Pepper anfragen').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })

  test('auf Englisch', async () => {
    setLang('en')
    setup({ eigene: [wartend] })
    const container = await renderUi(<WirWarenHierSection partner={partner} />)
    expect(container.querySelector('h2').textContent).toBe('We were here')
    expect(container.textContent).toContain('Waiting for Hundeschule Pfotenglück to approve')
    expect(container.textContent).toContain('Once the place has approved you, you will see here who else was there.')
  })
})
