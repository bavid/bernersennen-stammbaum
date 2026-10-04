// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { publicPartner, publicPartnerAnimals, publicHappyEnds, publicPartnerPosts } = vi.hoisted(() => ({
  publicPartner: vi.fn(),
  publicPartnerAnimals: vi.fn(),
  publicHappyEnds: vi.fn(),
  publicPartnerPosts: vi.fn()
}))
vi.mock('../api', () => ({ api: { publicPartner, publicPartnerAnimals, publicHappyEnds, publicPartnerPosts } }))

import PartnerPortalPage from './PartnerPortalPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  // Sinnvoller Standard, damit Tests, die die Vermittlungs-Sektion/Happy-Ends nicht betreffen, die
  // beiden nicht extra mocken müssen - Tests, die eine Liste brauchen, überschreiben das gezielt.
  publicPartnerAnimals.mockResolvedValue([])
  publicHappyEnds.mockResolvedValue([])
  publicPartnerPosts.mockResolvedValue([])
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  publicPartner.mockReset()
  publicPartnerAnimals.mockReset()
  publicHappyEnds.mockReset()
  publicPartnerPosts.mockReset()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const slug = props?.slug || 'tierheim-sonnenhang'
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[props?.path || `/p/${slug}`]}>
        <ThemeProvider themeId="standard">
          <PartnerPortalPage slug={slug} {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const partner = {
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  plz: '10115',
  ort: 'Berlin',
  lat: 52.52,
  lon: 13.41,
  website: 'https://sonnenhang.example.org',
  kontakt_email: 'info@sonnenhang.example.org',
  kontakt_telefon: null,
  logoUrl: '/partner-media/sonnenhang.png',
  badge: 'partner',
  portal_titel: null,
  portal_text: 'Wir freuen uns über jeden Besuch.\n\nSchaut gern vorbei.',
  spenden_url: 'https://sonnenhang.example.org/spenden',
  vermittlung_url: 'https://sonnenhang.example.org/vermittlung',
  farbe: '#2f6b3f'
}

describe('PartnerPortalPage – Name, Text und Akzentfarbe', () => {
  test('rendert den Namen als Überschrift, Art und Ort als Meta-Zeile, Text als Absätze und die Akzentfarbe', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()

    expect(container.querySelector('h1').textContent).toBe('Tierheim Sonnenhang')
    expect(container.querySelector('.partner-portal-meta').textContent).toBe('Tierheim · Berlin')
    expect(container.querySelector('.partner-portal-tagline')).toBeNull()
    const paragraphs = [...container.querySelectorAll('.partner-portal-text')].map((p) => p.textContent)
    expect(paragraphs).toEqual(['Wir freuen uns über jeden Besuch.', 'Schaut gern vorbei.'])

    const portalEl = container.querySelector('.partner-portal')
    expect(portalEl.style.getPropertyValue('--rust')).toBe('#2f6b3f')
    expect(portalEl.style.getPropertyValue('--on-rust')).toBe('#fffaf2')
    expect(portalEl.style.getPropertyValue('--rust-deep')).toMatch(/^#[0-9a-f]{6}$/)
    expect(portalEl.style.getPropertyValue('--rust-wash')).toMatch(/^rgba\(/)
  })

  test('portal_titel erscheint als Unterzeile unter dem Namen', async () => {
    publicPartner.mockResolvedValue({ ...partner, portal_titel: 'Schön, dass ihr da seid' })
    await render()
    expect(container.querySelector('h1').textContent).toBe('Tierheim Sonnenhang')
    expect(container.querySelector('.partner-portal-tagline').textContent).toBe('Schön, dass ihr da seid')
  })

  test('eine ungültige Farbe wird ignoriert – kein Inline-Style, keine Injektion', async () => {
    publicPartner.mockResolvedValue({ ...partner, farbe: 'expression(alert(1))' })
    await render()
    const portalEl = container.querySelector('.partner-portal')
    expect(portalEl.getAttribute('style')).toBeNull()
  })

  test('ohne Farbe (null) bleibt der Container ohne Inline-Style', async () => {
    publicPartner.mockResolvedValue({ ...partner, farbe: null })
    await render()
    expect(container.querySelector('.partner-portal').getAttribute('style')).toBeNull()
  })
})

describe('PartnerPortalPage – unbekannt oder inaktiv', () => {
  test('zeigt eine freundliche 404-Seite mit Link zur Partnerliste', async () => {
    publicPartner.mockRejectedValue(Object.assign(new Error('Diesen Partner gibt es nicht'), { status: 404 }))
    await render()

    expect(container.textContent).toContain('Diesen Partner gibt es nicht')
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zur Partnerliste'))
    expect(link.getAttribute('href')).toBe('/partner')
  })
})

describe('PartnerPortalPage – Vorschau-Band für Admins', () => {
  test('zeigt das Vorschau-Band bei preview: true', async () => {
    publicPartner.mockResolvedValue({ ...partner, preview: true })
    await render()
    expect(container.querySelector('[role="status"]').textContent).toContain('Vorschau')
  })

  test('kein Vorschau-Band im Normalfall', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(container.querySelector('.preview-banner')).toBeNull()
  })
})

function contactPanel() {
  return container.querySelector('#portal-panel-kontakt')
}

describe('PartnerPortalPage – Reiter Kontakt: euer Kontakt zuerst, der Einladungscode klein am Ende', () => {
  test('erst der Kontakt des Partners (Überschrift, Website, E-Mail, "PLZ Ort"), danach die leise Karte zum Einladungscode', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()

    const panel = contactPanel()
    const contact = panel.querySelector('#partner-portal-contact')
    const note = panel.querySelector('.portal-code-note')
    expect(contact.querySelector('h2').textContent).toBe('Kontakt')
    expect(contact.querySelector('a[href="mailto:info@sonnenhang.example.org"]')).not.toBeNull()
    expect(contact.textContent).toContain('10115 Berlin')
    // Reihenfolge im Dokument: der Partner vor der Plattform.
    expect(contact.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.lastElementChild).toBe(note)
  })

  test('die Karte ist klein: keine Überschrift, ein Satz, EIN Text-Link zu /v - kein Formular, kein großer Knopf', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()

    const note = contactPanel().querySelector('.portal-code-note')
    expect(note.querySelectorAll('h1, h2, h3, h4')).toHaveLength(0)
    expect(note.querySelector('.portal-code-note-title').textContent).toBe('Einladungscode bekommen?')
    expect(note.textContent).toContain('Damit legt ihr kostenlos eure eigene Tier-Chronik an.')
    // Der Partner-Name steht hier nicht noch einmal.
    expect(note.textContent).not.toContain('Tierheim Sonnenhang')
    const links = note.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toBe('Code einlösen')
    expect(links[0].getAttribute('href')).toBe('/v')
    expect(links[0].className).not.toMatch(/\bbtn\b/)
    expect(note.querySelectorAll('button, input, form')).toHaveLength(0)
    expect(container.querySelector('#redeem-code')).toBeNull()
  })

  test('der Einladungscode steht genau einmal auf der Seite - nicht im Kopf, nicht in der Übersicht', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()

    expect(container.querySelector('.partner-portal-hero').textContent).not.toContain('Einladungscode')
    expect(container.querySelector('#portal-panel-uebersicht').textContent).not.toContain('Einladungscode')
    expect(container.textContent.match(/Einladungscode/g)).toHaveLength(1)
  })
})

describe('PartnerPortalPage – angemeldet in der Hülle der App (inApp)', () => {
  test('kein zweiter Kopf oder Fuß, kein Einladungscode und kein "Zurück zu eurer Chronik" - der Kontakt bleibt', async () => {
    publicPartner.mockResolvedValue(partner)
    await render({ inApp: true })

    expect(container.querySelector('h1').textContent).toBe('Tierheim Sonnenhang')
    expect(container.querySelector('.partner-portal').classList.contains('public-page')).toBe(false)
    expect(container.querySelector('.public-header')).toBeNull()
    expect(container.querySelector('.public-footer')).toBeNull()
    expect(container.querySelector('.portal-brand-strip')).toBeNull()
    expect(container.querySelector('.portal-code-note')).toBeNull()
    expect(container.textContent).not.toContain('Einladungscode')
    expect(container.textContent).not.toContain('Zurück zu eurer Chronik')
    expect(container.textContent).not.toContain('Abmelden')
    expect(contactPanel().querySelector('#partner-portal-contact')).not.toBeNull()
  })

  test('ohne jeden Kontaktweg fehlt angemeldet der Reiter Kontakt ganz (er bliebe leer)', async () => {
    publicPartner.mockResolvedValue({ ...partner, website: null, kontakt_email: null })
    await render({ inApp: true })
    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.firstChild.textContent)).not.toContain('Kontakt')
  })

  test('"gibt es nicht" angemeldet ohne eigenen Kopf und Fuß', async () => {
    publicPartner.mockRejectedValue(Object.assign(new Error('Diesen Partner gibt es nicht'), { status: 404 }))
    await render({ inApp: true })
    expect(container.textContent).toContain('Diesen Partner gibt es nicht')
    expect(container.querySelector('.public-header')).toBeNull()
    expect(container.querySelector('.public-footer')).toBeNull()
  })
})

describe('PartnerPortalPage – keine Demo auf dem Portal', () => {
  // Auch ein Demo-Partner (shelterDemo/partnerDemo, gesperrtes "Schreib uns") nennt nirgends eine Demo.
  const demoPartner = { ...partner, shelterDemo: true, partnerDemo: true, kontaktformular: false, kontaktformularDemo: true }

  test('weder Demo-Knöpfe noch Demo-Hinweise - auch nicht in den verborgenen Reitern', async () => {
    publicPartner.mockResolvedValue(demoPartner)
    await render()

    expect(container.textContent).not.toMatch(/Demo/i)
    expect([...container.querySelectorAll('button')].some((btn) => /Demo/i.test(btn.textContent))).toBe(false)
    // Das gesperrte "Schreib uns" erklärt sich neutral.
    expect(container.querySelector('.contact-partner-preview .field-hint').textContent).toBe('Hier werden keine Nachrichten verschickt.')
  })

  test('stattdessen im Fuß EIN leiser Link zur Startseite: "Was ist Familie auf Pfoten?"', async () => {
    publicPartner.mockResolvedValue(demoPartner)
    await render()

    const strip = container.querySelector('.portal-brand-strip')
    expect([...strip.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Was ist Familie auf Pfoten?', '/']])
  })
})

describe('PartnerPortalPage – Links und Kontakt', () => {
  test('Spenden- und Vermittlungslinks öffnen extern mit rel=noopener noreferrer', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()

    // Der Name steht nicht noch einmal im Knopf - nur "Spenden".
    const spenden = [...container.querySelectorAll('.partner-portal-hero a')].find((a) => a.textContent.trim() === 'Spenden')
    expect(spenden.getAttribute('href')).toBe('https://sonnenhang.example.org/spenden')
    expect(spenden.getAttribute('target')).toBe('_blank')
    expect(spenden.getAttribute('rel')).toBe('noopener noreferrer')

    const vermittlung = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Tiere in Vermittlung'))
    expect(vermittlung.getAttribute('href')).toBe('https://sonnenhang.example.org/vermittlung')
  })

  test('ein nicht-http(s) Link wird nicht gerendert', async () => {
    publicPartner.mockResolvedValue({ ...partner, spenden_url: 'javascript:alert(1)', vermittlung_url: null })
    await render()
    expect([...container.querySelectorAll('a')].some((a) => a.textContent.includes('Spenden'))).toBe(false)
  })

  test('zeigt die E-Mail-Adresse als mailto-Link', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    const mail = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'mailto:info@sonnenhang.example.org')
    expect(mail).not.toBeUndefined()
  })
})

describe('PartnerPortalPage – Vermittlungs-Sektion "Fellnasen/Tiere suchen ein Zuhause" (Task 5)', () => {
  const dog = {
    slug: 'pepper-ab12cd',
    name: 'Pepper',
    tierart: 'hund',
    geschlecht: 'huendin',
    rasse: 'Mischling',
    geburtsdatum: null,
    fotoUrl: null,
    vermittlung_status: 'in_vermittlung'
  }

  test('ohne Tiere in Vermittlung erscheint die Sektion gar nicht', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(container.querySelector('.partner-portal-animals')).toBeNull()
  })

  test('zeigt "Fellnasen suchen ein Zuhause" und eine Karte je Tier, wenn nur Hunde/Katzen vermittelt werden', async () => {
    publicPartner.mockResolvedValue(partner)
    publicPartnerAnimals.mockResolvedValue([dog])
    await render()

    expect(container.querySelector('.partner-portal-animals h2').textContent).toBe('Fellnasen suchen ein Zuhause')
    const link = container.querySelector('.partner-portal-animals a')
    expect(link.getAttribute('href')).toBe('/t/pepper-ab12cd')
    expect(container.textContent).toContain('Pepper')
  })

  test('zeigt "Tiere suchen ein Zuhause", sobald eine andere Tierart dabei ist', async () => {
    publicPartner.mockResolvedValue(partner)
    publicPartnerAnimals.mockResolvedValue([dog, { ...dog, slug: 'momo-ef34gh', name: 'Momo', tierart: 'anderes' }])
    await render()

    expect(container.querySelector('.partner-portal-animals h2').textContent).toBe('Tiere suchen ein Zuhause')
  })

  test('ruft api.publicPartnerAnimals ohne demo auf, wenn das Portal normal geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(publicPartnerAnimals).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: undefined })
  })

  test('ruft api.publicPartnerAnimals mit demo=1 auf, wenn das Portal selbst mit ?demo=1 geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render({ path: '/p/tierheim-sonnenhang?demo=1' })
    expect(publicPartnerAnimals).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: '1' })
  })

  test('auch die Portal-Daten selbst (api.publicPartner) bekommen demo=1 mit - sonst 404t ein Demo-Portal in Produktion', async () => {
    publicPartner.mockResolvedValue(partner)
    await render({ path: '/p/tierheim-sonnenhang?demo=1&reiter=tiere' })
    expect(publicPartner).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: '1' })
  })

  test('ohne ?demo=1 geht api.publicPartner ohne demo', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(publicPartner).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: undefined })
  })
})

describe('PartnerPortalPage – Sektion "Happy Ends" (Task 6)', () => {
  const happyEnd = {
    name: 'Nele',
    tierart: 'hund',
    fotoUrl: '/public-media/nele.jpg',
    entry: { titel: 'Nele zieht ein – die ersten Tage', datum: '2021-06-12', text: 'Anfangs schüchtern, heute die Chefin.', fotoUrl: null }
  }

  test('ohne Happy Ends erscheint die Sektion gar nicht', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(container.querySelector('.partner-portal-happy-ends')).toBeNull()
  })

  test('zeigt "Happy Ends" mit Name, Eintragstitel/-datum und gekürztem Text je Tier', async () => {
    publicPartner.mockResolvedValue(partner)
    publicHappyEnds.mockResolvedValue([happyEnd])
    await render()

    const section = container.querySelector('.partner-portal-happy-ends')
    expect(section).not.toBeNull()
    expect(section.querySelector('h2').textContent).toBe('Happy Ends')
    expect(section.textContent).toContain('Nele')
    expect(section.textContent).toContain('Nele zieht ein – die ersten Tage')
    expect(section.textContent).toContain('Anfangs schüchtern, heute die Chefin.')
  })

  test('ruft api.publicHappyEnds ohne demo auf, wenn das Portal normal geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(publicHappyEnds).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: undefined })
  })

  test('ruft api.publicHappyEnds mit demo=1 auf, wenn das Portal selbst mit ?demo=1 geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render({ path: '/p/tierheim-sonnenhang?demo=1' })
    expect(publicHappyEnds).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: '1' })
  })
})

describe('PartnerPortalPage – Einblicke (Phase P1)', () => {
  test('zeigt die Einblicke des Portals als eigene Sektion', async () => {
    publicPartner.mockResolvedValue({
      ...partner,
      einblicke: [{ id: 9, fotoUrl: '/public-media/99999999-9999-9999-9999-999999999999.jpg', datum: '2026-09-20', text: 'Tag der offenen Tür' }]
    })
    await render()

    const section = container.querySelector('.partner-portal-einblicke')
    expect(section.querySelector('h2').textContent).toBe('Einblicke')
    expect(section.querySelector('img').getAttribute('src')).toBe('/public-media/99999999-9999-9999-9999-999999999999.jpg')
    expect(section.querySelector('img').getAttribute('alt')).toBe('Tag der offenen Tür')
  })

  test('ohne Einblicke keine Sektion', async () => {
    publicPartner.mockResolvedValue({ ...partner, einblicke: [] })
    await render()
    expect(container.querySelector('.partner-portal-einblicke')).toBeNull()
  })
})

// Kundensicht: load statt api.publicPartner, preview schaltet Links und "Schreib uns" ab.
describe('PartnerPortalPage – Vorschau (Kundensicht)', () => {
  const previewData = {
    ...partner,
    shelterDemo: true,
    partnerDemo: true,
    vorschau: true,
    status: 'entwurf',
    einblicke: [{ id: 9, fotoUrl: '/uploads/99999999-9999-9999-9999-999999999999.jpg', datum: '2026-09-20', text: 'Tag der offenen Tür' }],
    tiere: [
      {
        slug: 'pepper-ab12',
        name: 'Pepper',
        tierart: 'hund',
        geschlecht: 'huendin',
        rasse: 'Mischling',
        geburtsdatum: null,
        fotoUrl: '/uploads/88888888-8888-8888-8888-888888888888.jpg',
        vermittlung_status: 'in_vermittlung'
      }
    ]
  }

  async function renderPreview(load) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/kundensicht']}>
          <ThemeProvider themeId="standard">
            <PartnerPortalPage load={load} preview />
          </ThemeProvider>
        </MemoryRouter>
      )
    )
  }

  test('lädt über load statt über die öffentlichen Endpunkte und zeigt /uploads-Fotos (Einblicke, Tiere)', async () => {
    const load = vi.fn().mockResolvedValue(previewData)
    await renderPreview(load)

    expect(load).toHaveBeenCalledTimes(1)
    expect(publicPartner).not.toHaveBeenCalled()
    expect(publicPartnerAnimals).not.toHaveBeenCalled()
    expect(publicHappyEnds).not.toHaveBeenCalled()
    expect(container.querySelector('.einblick-tile img').getAttribute('src')).toBe('/uploads/99999999-9999-9999-9999-999999999999.jpg')
    expect(container.querySelector('.shelter-card img').getAttribute('src')).toBe('/uploads/88888888-8888-8888-8888-888888888888.jpg')
  })

  test('kein Formular, keine Demo, kein Kopf mit "Zurück", kein Fuß - die Karte zum Einladungscode wie bei Kunden, deaktiviert', async () => {
    await renderPreview(vi.fn().mockResolvedValue(previewData))

    expect(container.querySelector('.public-header')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
    expect(container.textContent).not.toMatch(/Demo/i)
    expect(container.querySelector('.public-footer')).toBeNull()
    const note = container.querySelector('.portal-code-note')
    expect(note.querySelector('a')).toBeNull()
    expect(note.querySelector('[aria-disabled="true"]').textContent).toBe('Code einlösen')
  })

  test('alle Links sind deaktiviert: Spenden, Vermittlung, Website, E-Mail und die Tierkarten', async () => {
    await renderPreview(vi.fn().mockResolvedValue(previewData))

    expect(container.querySelectorAll('a')).toHaveLength(0)
    const disabled = [...container.querySelectorAll('[aria-disabled="true"]')].map((el) => el.textContent.trim())
    // Mit eigenen Tieren steht die Vermittlungsseite im Reiter "Tiere" statt im Kopf.
    expect(disabled).toEqual(
      expect.arrayContaining(['Spenden', 'Alle Tiere auf der Vermittlungsseite', 'https://sonnenhang.example.org', 'info@sonnenhang.example.org'])
    )
    expect(container.querySelector('.shelter-card').getAttribute('aria-disabled')).toBe('true')
  })

  test('schlägt load fehl, erscheint ein Hinweis statt "Diesen Partner gibt es nicht"', async () => {
    await renderPreview(vi.fn().mockRejectedValue(new Error('Fehler 500')))

    expect(container.querySelector('[role="alert"]').textContent).toContain('Die Vorschau konnte gerade nicht geladen werden')
    expect(container.textContent).not.toContain('Diesen Partner gibt es nicht')
  })
})
