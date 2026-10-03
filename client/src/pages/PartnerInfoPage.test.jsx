// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { config, demo } = vi.hoisted(() => ({ config: vi.fn(), demo: vi.fn() }))
vi.mock('../api', () => ({ api: { config, demo } }))

import PartnerInfoPage, { DEMO_PARTNERS } from './PartnerInfoPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  config.mockResolvedValue({ appEnv: 'prod', legal: { name: 'Beispiel-Betreiber', email: 'hallo@beispiel-chronik.de' } })
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  ;[...document.head.querySelectorAll('meta[name="robots"]')].forEach((el) => el.remove())
  config.mockReset()
  demo.mockReset()
})

async function render(props = {}, path = '/partner-werden') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <PartnerInfoPage onDemo={() => {}} {...props} />
      </MemoryRouter>
    )
  )
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

describe('PartnerInfoPage – Inhalt', () => {
  test('nennt die Zielgruppe, die fünf Vorteile und die drei Schritte', async () => {
    await render()

    expect(container.querySelector('h1').textContent).toBe('Euer Auftritt bei Familie auf Pfoten')
    expect(container.textContent).toContain('Für Hundeschulen, Tierheime, Hundesalons und Betreuung')
    const benefits = [...container.querySelectorAll('.partner-info-benefit h3')].map((el) => el.textContent)
    expect(benefits).toEqual(['Profil & Einblicke', 'Kundensicht', 'Schreib uns mit Postfach', 'Beiträge als Anzeige', 'Kalender', 'Visitenkarten & Gutscheine'])
    const steps = [...container.querySelectorAll('.partner-info-steps h3')].map((el) => el.textContent)
    expect(steps).toEqual(['Partner-Zugang erhalten', 'Profil einrichten', 'Veröffentlichen'])
    expect(container.textContent).toContain('So funktioniert’s')
    expect(container.querySelector('.public-footer')).not.toBeNull()
  })

  test('setzt <meta name="robots" content="noindex">, solange die Seite offen ist', async () => {
    await render()
    const meta = document.head.querySelector('meta[name="robots"]')
    expect(meta.getAttribute('content')).toBe('noindex')

    act(() => root.unmount())
    root = null
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})

describe('PartnerInfoPage – Demo-Knöpfe', () => {
  test('stehen ganz oben (Phase U): direkt unter dem Seitenkopf, vor den Vorteilen', async () => {
    await render()

    const showcase = container.querySelector('.partner-info-showcase')
    expect(showcase.querySelector('h2').textContent).toBe('So sieht euer Partner-Bereich aus')
    const benefits = container.querySelector('.partner-info-benefits')
    expect(showcase.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const sections = [...container.querySelectorAll('.partner-info-page > section')]
    expect(sections[0]).toBe(showcase)
    expect([...showcase.querySelectorAll('button')].map((btn) => btn.textContent)).toEqual([
      'Demo als Hundeschule ansehen',
      'Demo als Tierheim ansehen',
      'Demo als Hundesalon ansehen'
    ])
    expect(container.querySelector('.partner-info-page > .public-header')).not.toBeNull()
  })

  test('"Demo als Hundeschule ansehen" ruft api.demo mit as partner und dem Slug der Demo-Hundeschule, dann onDemo', async () => {
    const me = { id: 70, art: 'partner', isDemo: true }
    demo.mockResolvedValue(me)
    const onDemo = vi.fn()
    await render({ onDemo })

    await act(async () => button('Demo als Hundeschule ansehen').click())

    expect(demo).toHaveBeenCalledWith({ as: 'partner', slug: 'hundeschule-pfotenglueck' })
    expect(onDemo).toHaveBeenCalledWith(me)
  })

  test('"Demo als Hundesalon ansehen" nutzt den Slug des Demo-Salons', async () => {
    demo.mockResolvedValue({ id: 71, art: 'partner', isDemo: true })
    await render()

    await act(async () => button('Demo als Hundesalon ansehen').click())

    expect(demo).toHaveBeenCalledWith({ as: 'partner', slug: 'hundesalon-wuschelglueck' })
    expect(DEMO_PARTNERS.map((option) => option.key)).toEqual(['hundeschule', 'tierheim', 'hundesalon'])
  })

  test('"Demo als Tierheim ansehen" meldet im Demo-Tierheim an', async () => {
    demo.mockResolvedValue({ id: 72, art: 'tierheim', isDemo: true })
    await render()

    await act(async () => button('Demo als Tierheim ansehen').click())

    expect(demo).toHaveBeenCalledWith({ as: 'tierheim' })
  })

  test('ein Fehler der Demo erscheint als Alert, die Knöpfe sind wieder frei', async () => {
    demo.mockRejectedValue(new Error('Keine Demo verfügbar'))
    const onDemo = vi.fn()
    await render({ onDemo })

    await act(async () => button('Demo als Hundeschule ansehen').click())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Keine Demo verfügbar')
    expect(onDemo).not.toHaveBeenCalled()
    expect(button('Demo als Hundeschule ansehen').disabled).toBe(false)
  })
})

describe('PartnerInfoPage – Kontakt', () => {
  test('mit E-Mail im Impressum: mailto-Link', async () => {
    await render()
    const contact = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Kontakt aufnehmen'))
    expect(contact.getAttribute('href')).toBe('mailto:hallo@beispiel-chronik.de')
  })

  test('ohne E-Mail (oder ohne Konfiguration): Weg zum Impressum', async () => {
    config.mockResolvedValue({ appEnv: 'prod', legal: { name: 'Beispiel-Betreiber' } })
    await render()
    const contact = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Kontakt über das Impressum'))
    expect(contact.getAttribute('href')).toBe('/impressum')

    act(() => root.unmount())
    root = null
    container.remove()

    config.mockRejectedValue(new Error('Fehler 500'))
    await render()
    expect([...container.querySelectorAll('a')].some((a) => a.textContent.includes('Kontakt über das Impressum'))).toBe(true)
  })
})

// Phase N: "Partner-Zugang anfragen" direkt unter den Demo-Knöpfen, Sprungziel #anfragen.
describe('PartnerInfoPage – Partner-Zugang anfragen', () => {
  test('steht als zweiter Abschnitt direkt unter den Demo-Knöpfen, mit Formular und Erklärung', async () => {
    await render()

    const sections = [...container.querySelectorAll('.partner-info-page > section')]
    const request = sections[1]
    expect(request.id).toBe('anfragen')
    expect(request.querySelector('h2').textContent).toBe('Partner-Zugang anfragen')
    expect(request.querySelector('.request-why h3').textContent).toBe('Warum anfragen?')
    expect(request.querySelector('#request-partner-firma')).not.toBeNull()
    expect(request.querySelector('button[type="submit"]').textContent).toBe('Partner-Zugang anfragen')
  })

  test('/partner-werden#anfragen rückt den Abschnitt nach oben und fokussiert seine Überschrift', async () => {
    // jsdom kennt scrollIntoView nicht - ein Stellvertreter prüft, dass der Abschnitt gerufen wird.
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      await render({}, '/partner-werden#anfragen')
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
      expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector('#anfragen'))
      expect(document.activeElement).toBe(container.querySelector('#partner-info-request-title'))
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })

  test('ohne Sprungmarke bleibt der Fokus, wo er ist', async () => {
    await render()
    expect(document.activeElement).not.toBe(container.querySelector('#partner-info-request-title'))
  })
})
