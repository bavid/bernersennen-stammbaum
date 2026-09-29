// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('../api', () => ({ api: { config } }))

import LegalPage from './LegalPage.jsx'

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
  config.mockReset()
})

async function render(variant) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <LegalPage variant={variant} />
      </MemoryRouter>
    )
  )
  return container
}

describe('LegalPage – /impressum', () => {
  test('ohne Betreiberangaben: ehrlicher Hinweis statt erfundener Daten', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('impressum')

    expect(container.querySelector('h1').textContent).toBe('Impressum')
    expect(container.textContent).toContain('Die Betreiberangaben werden vor dem Start ergänzt.')
  })

  test('mit Betreiberangaben: zeigt Name, Adresse (mehrzeilig), E-Mail und Telefon', async () => {
    config.mockResolvedValue({
      appEnv: 'production',
      legal: { name: 'Tierheim Sonnenhang e.V.', address: 'Musterstraße 1\n12345 Musterstadt', email: 'kontakt@example.org', phone: '+49 30 1234567' }
    })
    await render('impressum')

    expect(container.textContent).toContain('Tierheim Sonnenhang e.V.')
    expect(container.textContent).toContain('Musterstraße 1')
    expect(container.textContent).toContain('12345 Musterstadt')
    expect(container.textContent).toContain('kontakt@example.org')
    expect(container.textContent).toContain('+49 30 1234567')
    expect(container.textContent).not.toContain('Die Betreiberangaben werden vor dem Start ergänzt.')
  })
})

describe('LegalPage – /datenschutz', () => {
  test('beschreibt Cookie, Standortrundung, Umkreissuche über den eigenen Server und PLZ-Quelle', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.querySelector('h1').textContent).toBe('Datenschutz')
    expect(container.textContent).toMatch(/Cookie/)
    expect(container.textContent).toMatch(/OpenStreetMap/)
    expect(container.textContent).toMatch(/GeoNames/)
    expect(container.textContent).toMatch(/nie.*gespeichert|nicht gespeichert/)
  })

  test('beschreibt Schlüssel als Hash und offene Gutschein-Codes zusätzlich AES-GCM-verschlüsselt bis Einlösung/Widerruf', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).toMatch(/Hash/)
    expect(container.textContent).toMatch(/AES-GCM/)
    expect(container.textContent).toMatch(/eingelöst.*zurückgezogen|eingelöst oder zurückgezogen/)
  })

  test('nennt, dass /partner nur die PLZ und die eigene Datenbank nutzt (kein Standort, keine externe Suche)', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).toMatch(/\/partner/)
    expect(container.textContent).toMatch(/eigene Partner-Datenbank|eigene.*Datenbank/)
  })

  test('nennt den serverseitigen Cache der Umkreissuche (~7 Tage, ~5 km, ohne Personenbezug)', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).toMatch(/7 Tage/)
    expect(container.textContent).toMatch(/5-km|5 km/)
    expect(container.textContent).toMatch(/ohne Bezug zu einer bestimmten Person/)
  })

  test('nennt, dass PLZ und Radius der letzten Umkreissuche im Browser (localStorage) auf diesem Gerät gemerkt werden', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).toMatch(/localStorage/)
    expect(container.textContent).toMatch(/diesem Gerät/)
  })

  test('nennt die Speicherung des Partner-Bezugs (Gutschein-Beitritt) und der letzten Login-Zeit optionaler Benutzer', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).toMatch(/über welchen Partner/)
    expect(container.textContent).toMatch(/letzte[nr]? Anmeldung/)
  })

  test('macht keine Aussage über den Hosting-Standort', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).not.toMatch(/Hosting|gehostet in|Rechenzentrum|Server steht in/)
  })

  test('Kontakt ohne Impressums-E-Mail verweist auf das Impressum statt eine E-Mail zu erfinden', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/impressum')
    expect(link).not.toBeUndefined()
  })

  test('Kontakt mit Impressums-E-Mail verlinkt sie als mailto:', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: 'X', address: '', email: 'kontakt@example.org', phone: '' } })
    await render('datenschutz')
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'mailto:kontakt@example.org')
    expect(link).not.toBeUndefined()
  })

  // final-review Phase T Finding 3: eigener Absatz "Tierheime" - öffentliche Steckbriefe, Übergabe/
  // Umzug der Chronik, freiwilliges Mitlesen und Happy Ends brauchen eine eigene, ehrliche Erklärung.
  test('Absatz "Tierheime": öffentliche Steckbriefe (/t/…, nur als öffentlich markierte Einträge, noindex)', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect([...container.querySelectorAll('h2')].some((h) => h.textContent === 'Tierheime')).toBe(true)
    expect(container.textContent).toMatch(/\/t\/…/)
    expect(container.textContent).toMatch(/noindex/)
  })

  test('Absatz "Tierheime": Übergabe/Umzug der Chronik, Herkunft bleibt sichtbar, freiwilliges und widerrufbares Mitlesen', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).toMatch(/Übergabe-Gutschein/)
    expect(container.textContent).toMatch(/Herkunft sichtbar/)
    expect(container.textContent).toMatch(/freiwillig/)
    expect(container.textContent).toMatch(/jederzeit widerrufen/)
    expect(container.textContent).toMatch(/nicht-privaten Einträge/)
  })

  test('Absatz "Tierheime": Happy Ends nur mit separater Einwilligung, keine Namen, sofortiger Widerruf (Browser-Cache als Ausnahme)', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect(container.textContent).toMatch(/Happy End/)
    expect(container.textContent).toMatch(/Porträtfoto/)
    expect(container.textContent).toMatch(/neueste[nr]? nicht-private[nr]? Eintrag/)
    expect(container.textContent).toMatch(/nie Namen/)
    expect(container.textContent).toMatch(/Widerruf wirkt sofort/)
    expect(container.textContent).toMatch(/Browser.*zwischengespeichert/)
  })

  // Phase 3: "Entdecken" zählt Klicks auf Empfehlungen/Partner-Links über /r/… - die Seite muss ehrlich
  // sagen, was dabei gespeichert wird (nur Ziel, Tag, Anzahl) und was nicht (keine Cookies, keine IP).
  test('Absatz "Entdecken": Kennzeichnung und anonyme Klickzählung ohne Cookies und IP-Adressen', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect([...container.querySelectorAll('h2')].some((h) => h.textContent === 'Entdecken und Empfehlungen')).toBe(true)
    expect(container.textContent).toMatch(/„Anzeige“/)
    expect(container.textContent).toMatch(/je Ziel und Tag/)
    expect(container.textContent).toMatch(/keine Cookies/)
    expect(container.textContent).toMatch(/keine IP-Adressen/)
    expect(container.textContent).toMatch(/Suchmaschinen- und anderen Bots/)
  })

  // Phase P1: Einblicke zeigen Fotos fremder Tiere öffentlich - Einwilligung, Metadaten und Ausblenden erklären.
  test('Absatz "Partner-Profile und Einblicke": Einwilligung der Halter, EXIF entfernt, nur bei veröffentlichtem Profil', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect([...container.querySelectorAll('h2')].some((h) => h.textContent === 'Partner-Profile und Einblicke')).toBe(true)
    expect(container.textContent).toMatch(/Halterinnen und Halter der gezeigten Tiere einverstanden/)
    expect(container.textContent).toMatch(/EXIF/)
    expect(container.textContent).toMatch(/solange das Profil veröffentlicht ist/)
    expect(container.textContent).toMatch(/blenden den Einblick dann aus/)
  })

  // Phase P2: "Schreib uns" speichert Kontaktdaten und Nachrichten für den Partner - was, wer es sieht, wie lange.
  test('Absatz "Nachrichten an Partner": was gespeichert wird, nur der Partner sieht es, keine E-Mails, 180 Tage, Limit', async () => {
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('datenschutz')

    expect([...container.querySelectorAll('h2')].some((h) => h.textContent === 'Nachrichten an Partner')).toBe(true)
    expect(container.textContent).toMatch(/E-Mail-Adresse oder Telefonnummer/)
    expect(container.textContent).toMatch(/freiwillig ein Name/)
    expect(container.textContent).toMatch(/auf welches Tier sich die Anfrage bezieht/)
    expect(container.textContent).toMatch(/sieht nur der Partner selbst/)
    expect(container.textContent).toMatch(/keine E-Mails/)
    expect(container.textContent).toMatch(/nach\s+180 Tagen automatisch gelöscht/)
    expect(container.textContent).toMatch(/wie\s+viele Nachrichten in kurzer Zeit/)
  })
})
