// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  revier: {
    einstellungen: vi.fn(),
    saveEinstellungen: vi.fn(),
    saveTiere: vi.fn(),
    vorschau: vi.fn(),
    follower: vi.fn(),
    removeFollower: vi.fn()
  }
}))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import OeffentlichAnsicht from './OeffentlichAnsicht.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt showModal/close am <dialog> nicht - die Vorschau öffnet ein Modal.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

const SETTINGS = {
  aktiv: false,
  plz: null,
  ort: null,
  zustimmung: false,
  name: null,
  vorgabeName: 'Zuhause am Deich',
  text: null,
  ortZeigen: false,
  followerOeffentlich: false,
  gesperrt: false,
  slug: 'deich',
  bild: null,
  follower: 2,
  tiere: [
    { id: 11, name: 'Benno', tierart: 'hund', foto_url: null, sichtbar: false, oeffentlich: 0 },
    { id: 12, name: 'Wilma', tierart: 'hund', foto_url: null, sichtbar: true, oeffentlich: 1 }
  ]
}

let container
let root
let setRevier

async function render(me = { isDemo: false }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={me}>
          <OeffentlichAnsicht readOnly={Boolean(me.isDemo)} sicht={{ setRevier }} />
        </DemoProvider>
      </MemoryRouter>
    )
  )
  await act(async () => {})
}

const byText = (selector, text) => [...container.querySelectorAll(selector)].find((el) => el.textContent.trim() === text)
const switchNamed = (label) =>
  [...container.querySelectorAll('.share-switch')].find((el) => el.querySelector('.share-switch-label').textContent.startsWith(label)).querySelector('input')
const type = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  setLang('de')
  setRevier = vi.fn()
  api.revier.einstellungen.mockResolvedValue(SETTINGS)
  api.revier.saveEinstellungen.mockImplementation(async (patch) => ({ ...SETTINGS, ...patch, ort: 'Hamburg Spadenland' }))
  api.revier.saveTiere.mockImplementation(async (ids) => ({ ...SETTINGS, tiere: SETTINGS.tiere.map((tier) => ({ ...tier, sichtbar: ids.includes(tier.id) })) }))
  api.revier.vorschau.mockResolvedValue({ slug: 'deich', name: 'Zuhause am Deich', aktiv: false, eigenes: true, tiere: [], eintraege: [], weiter: null, follower: { anzahl: 2 } })
  api.revier.follower.mockResolvedValue({ anzahl: 2, follower: [{ id: 5, name: 'Benno vom Spadenland', slug: 'sp' }, { id: 6, name: null, slug: null }] })
  api.revier.removeFollower.mockResolvedValue(null)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
  setLang('de')
})

describe('Wer sieht was › Öffentlich', () => {
  test('Einschalten erst mit PLZ und Häkchen – dann ein Speichern für alles', async () => {
    await render()
    await act(async () => switchNamed('Profil öffentlich zeigen').click())
    expect(container.textContent).toContain('Zum Einschalten braucht es eure Postleitzahl und das Häkchen.')
    expect(byText('button', 'Speichern').disabled).toBe(true)
    await act(async () => type(container.querySelector('.revier-form input[inputmode="numeric"]'), '21037'))
    await act(async () => container.querySelector('.revier-zustimmung input').click())
    expect(byText('button', 'Speichern').disabled).toBe(false)
    await act(async () => byText('button', 'Speichern').click())
    expect(api.revier.saveEinstellungen).toHaveBeenCalledWith(
      expect.objectContaining({ aktiv: true, plz: '21037', zustimmung: true, name: null, ortZeigen: false, followerOeffentlich: false })
    )
    expect(setRevier).toHaveBeenCalled()
    expect(container.textContent).toContain('Öffentlich zu sehen')
  })

  test('je Tier ein Schalter, „Alle zeigen“ als Abkürzung', async () => {
    await render()
    expect(switchNamed('Benno').checked).toBe(false)
    expect(switchNamed('Wilma (1 öffentliche Erinnerungen)').checked).toBe(true)
    await act(async () => switchNamed('Benno').click())
    expect(api.revier.saveTiere).toHaveBeenLastCalledWith([12, 11])
    await act(async () => switchNamed('Benno').click())
    await act(async () => byText('button', 'Alle zeigen')?.click())
  })

  test('„Mein Profil für andere“ zeigt die Vorschau – auch ausgeschaltet', async () => {
    await render()
    await act(async () => byText('button', 'Mein Profil für andere').click())
    await act(async () => {})
    expect(api.revier.vorschau).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Noch ausgeschaltet – so würde es aussehen.')
  })

  test('Folgende: Liste mit Namen öffentlicher Profile, einzeln entfernen', async () => {
    await render()
    const details = container.querySelector('.revier-follower')
    details.open = true
    await act(async () => details.dispatchEvent(new Event('toggle')))
    expect(details.textContent).toContain('Benno vom Spadenland')
    expect(details.textContent).toContain('Ein Zuhause ohne öffentliches Profil')
    await act(async () => byText('.revier-follower button', 'Entfernen').click())
    expect(api.revier.removeFollower).toHaveBeenCalledWith(5)
  })

  test('Demo: alles nur ansehen', async () => {
    await render({ isDemo: true })
    expect(switchNamed('Profil öffentlich zeigen').disabled).toBe(true)
    expect(byText('button', 'Speichern').disabled).toBe(true)
  })

  test('auf Englisch', async () => {
    setLang('en')
    await render()
    expect(container.textContent).toContain('Show profile publicly')
    expect(container.textContent).toContain('My profile for others')
  })
})
