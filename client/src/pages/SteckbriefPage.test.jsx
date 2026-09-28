// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { publicAnimal } = vi.hoisted(() => ({ publicAnimal: vi.fn() }))
vi.mock('../api', () => ({ api: { publicAnimal } }))

import SteckbriefPage from './SteckbriefPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const animal = {
  name: 'Pepper',
  tierart: 'hund',
  geschlecht: 'huendin',
  rasse: 'Mischling',
  geburtsdatum: '2022-01-01',
  beschreibung: 'Pepper liebt lange Spaziergänge.\n\nSie ist sehr verschmust.',
  fotoUrl: '/public-media/pepper.jpg',
  entries: [
    {
      titel: 'Ankunft im Tierheim',
      datum: '2024-01-10',
      text: 'Pepper ist bei uns eingezogen.',
      kategorie: 'ankunft',
      fotoUrls: ['/public-media/pepper-ankunft.jpg']
    },
    {
      titel: 'Erster Tierarztbesuch',
      datum: '2024-02-01',
      text: 'Alles gut.',
      kategorie: 'tierarzt',
      fotoUrls: []
    }
  ],
  shelter: {
    name: 'Tierheim Sonnenhang',
    slug: 'tierheim-sonnenhang',
    website: 'https://sonnenhang.example.org',
    kontakt_email: 'info@sonnenhang.example.org',
    kontakt_telefon: '030 1234567',
    vermittlung_url: 'https://sonnenhang.example.org/vermittlung',
    logoUrl: '/partner-media/sonnenhang.png'
  }
}

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId="standard">
          <SteckbriefPage slug="pepper-ab12cd" {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  ;[...document.head.querySelectorAll('meta[name="robots"]')].forEach((el) => el.remove())
  publicAnimal.mockReset()
  delete navigator.share
})

describe('SteckbriefPage – Grunddaten', () => {
  test('rendert Titelbild, Name, Art/Geschlecht, Rasse und Alter', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    expect(container.querySelector('h1').textContent).toBe('Pepper')
    expect(container.querySelector('.eyebrow').textContent).toContain('Hund')
    expect(container.querySelector('.eyebrow').textContent).toContain('Hündin')
    expect(container.textContent).toContain('Mischling')
    expect(container.querySelector('img[alt="Pepper"]')).toBeNull() // Avatar liefert alt="" (dekorativ)
    expect(container.querySelector('.dog-hero-photo img').getAttribute('src')).toBe('/public-media/pepper.jpg')
  })

  test('rendert die Beschreibung als Klartext (kein HTML)', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    expect(container.querySelector('.dog-hero-description').textContent).toContain('Pepper liebt lange Spaziergänge.')
    expect(container.innerHTML).not.toContain('<script')
  })

  test('ruft api.publicAnimal mit dem Slug auf', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render({ slug: 'pepper-ab12cd' })
    expect(publicAnimal).toHaveBeenCalledWith('pepper-ab12cd')
  })
})

describe('SteckbriefPage – noindex', () => {
  test('setzt <meta name="robots" content="noindex"> im head, solange die Seite eingehängt ist', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    const meta = document.head.querySelector('meta[name="robots"]')
    expect(meta).not.toBeNull()
    expect(meta.getAttribute('content')).toBe('noindex')
  })

  test('entfernt das Meta-Tag beim Verlassen der Seite wieder', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()
    await act(async () => root.unmount())
    root = null

    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })

  test('setzt noindex auch im 404-Fall', async () => {
    publicAnimal.mockRejectedValue(Object.assign(new Error('Diesen Steckbrief gibt es nicht'), { status: 404 }))
    await render()

    expect(document.head.querySelector('meta[name="robots"]')).not.toBeNull()
  })
})

describe('SteckbriefPage – öffentliche Chronik', () => {
  test('zeigt die Einträge als Zeitleiste mit Kategorie-Chip', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    expect(container.textContent).toContain('Ankunft im Tierheim')
    expect(container.querySelector('.kategorie-badge').textContent).toBe('Ankunft')
    expect(container.textContent).toContain('Erster Tierarztbesuch')
  })

  test('zeigt Fotos eines Eintrags', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    const photo = container.querySelector('.entry-photo img')
    expect(photo.getAttribute('src')).toBe('/public-media/pepper-ankunft.jpg')
  })

  test('ohne öffentliche Einträge erscheint keine Chronik-Sektion', async () => {
    publicAnimal.mockResolvedValue({ ...animal, entries: [] })
    await render()

    expect(container.querySelector('.chronicle')).toBeNull()
  })
})

describe('SteckbriefPage – Tierheim-Kasten', () => {
  test('zeigt Logo, Name und den Hinweis, dass die Vermittlung über das Tierheim läuft', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    expect(container.querySelector('.steckbrief-shelter img').getAttribute('src')).toBe('/partner-media/sonnenhang.png')
    expect(container.querySelector('.steckbrief-shelter h2').textContent).toBe('Tierheim Sonnenhang')
    expect(container.textContent).toContain('Die Vermittlung läuft direkt über das Tierheim.')
  })

  test('E-Mail als mailto-Link, Telefon als tel-Link', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    const mail = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'mailto:info@sonnenhang.example.org')
    expect(mail).not.toBeUndefined()
    const tel = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href')?.startsWith('tel:'))
    expect(tel.getAttribute('href')).toBe('tel:0301234567')
  })

  test('eine ungültige Telefonnummer wird nicht zu einem tel-Link', async () => {
    publicAnimal.mockResolvedValue({ ...animal, shelter: { ...animal.shelter, kontakt_telefon: 'javascript:alert(1)' } })
    await render()

    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href')?.startsWith('tel:'))).toBe(false)
  })

  test('vermittlung_url öffnet extern mit rel=noopener noreferrer', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Zur Vermittlungsseite')
    expect(link.getAttribute('href')).toBe('https://sonnenhang.example.org/vermittlung')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('ein nicht-http(s) vermittlung_url wird nicht verlinkt', async () => {
    publicAnimal.mockResolvedValue({ ...animal, shelter: { ...animal.shelter, vermittlung_url: 'javascript:alert(1)' } })
    await render()

    expect([...container.querySelectorAll('a')].some((a) => a.textContent === 'Zur Vermittlungsseite')).toBe(false)
  })

  test('verlinkt auf das Portal des Tierheims (/p/:slug)', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zum Portal von Tierheim Sonnenhang'))
    expect(link.getAttribute('href')).toBe('/p/tierheim-sonnenhang')
  })
})

describe('SteckbriefPage – Teilen', () => {
  test('mit navigator.share ruft der Knopf navigator.share auf', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share })
    publicAnimal.mockResolvedValue(animal)
    await render()

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Teilen'))
    await act(async () => button.click())

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pepper' }))
  })

  test('ohne navigator.share kopiert der Knopf den Link und zeigt eine Bestätigung', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    publicAnimal.mockResolvedValue(animal)
    await render()

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Teilen'))
    await act(async () => button.click())

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/t/pepper-ab12cd`)
    expect(container.textContent).toContain('Link kopiert')
  })
})

describe('SteckbriefPage – nicht gefunden', () => {
  test('zeigt eine freundliche 404-Seite mit Link zur Partnerliste', async () => {
    publicAnimal.mockRejectedValue(Object.assign(new Error('Diesen Steckbrief gibt es nicht'), { status: 404 }))
    await render()

    expect(container.textContent).toContain('Diesen Steckbrief gibt es nicht')
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zur Partnerliste'))
    expect(link.getAttribute('href')).toBe('/partner')
  })
})

describe('SteckbriefPage – Vermittlungsstatus (Phase P)', () => {
  test('zeigt den Status als Chip, "Verfügbar" für in_vermittlung', async () => {
    publicAnimal.mockResolvedValue({ ...animal, vermittlung_status: 'in_vermittlung' })
    await render()

    expect(container.querySelector('.status-chip').textContent).toBe('Verfügbar')
    expect(container.textContent).not.toContain('Gerade nicht vermittelbar')
  })

  test('ein pausiertes Tier zeigt "Pausiert (on hold)" und den Hinweis, bald wieder vorbeizuschauen', async () => {
    publicAnimal.mockResolvedValue({ ...animal, vermittlung_status: 'pausiert' })
    await render()

    expect(container.querySelector('.status-chip').textContent).toBe('Pausiert (on hold)')
    expect(container.textContent).toContain('Gerade nicht vermittelbar – schaut bald wieder vorbei.')
  })

  test('ohne Status (ältere Antwort) weder Chip noch Hinweis', async () => {
    publicAnimal.mockResolvedValue(animal)
    await render()

    expect(container.querySelector('.status-chip')).toBeNull()
    expect(container.textContent).not.toContain('Gerade nicht vermittelbar')
  })
})
