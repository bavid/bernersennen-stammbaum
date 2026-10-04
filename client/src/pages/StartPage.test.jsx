// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  start: vi.fn(),
  erlebtMitOffen: vi.fn(),
  visits: vi.fn(),
  createTimelineEntry: vi.fn(),
  erlebtMitTiere: vi.fn(),
  upload: vi.fn(),
  onThisDay: vi.fn()
}))
vi.mock('../api', () => ({ api }))

import StartPage from './StartPage.jsx'
import HinweiseProvider from '../components/hinweise/HinweiseProvider.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

const words = getTheme('standard').words

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt showModal/close am <dialog> nicht - „Neu“ öffnet den Dialog „Neues Tier anlegen“.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, role: 'leitung', memberships: [{ id: 5, name: 'Familie Sonnenhang', rolle: 'mitglied' }], besuche: [] }
const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', role: 'leitung', home: { id: 2, art: 'rudel' }, memberships: [] }

const dog = (id, name, extra = {}) => ({ id, name, name_unbekannt: 0, tierart: 'hund', foto_url: null, bei_uns_seit: null, bei_uns_bis: null, ...extra })
// Eine Erinnerung, wie /api/timeline/jahrestag sie liefert (flach).
const entry = (id, extra = {}) => ({
  id,
  dog_id: 10,
  dog_name: 'Nele',
  titel: `Beitrag ${id}`,
  text: 'Heute am See.',
  foto_urls: [],
  autor_name: 'Mara',
  created_at: '2026-09-27 10:00:00',
  comment_count: 0,
  ...extra
})
// Bereiche und Einträge, wie GET /api/start sie liefert (Phase W, Schritt 3).
const homeArea = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen' }
const familyArea = { id: 5, name: 'Familie Sonnenhang', art: 'familie' }
const visitArea = { id: 8, name: 'Zuhause Möwenweg', art: 'besuch' }
const item = (id, extra = {}) => ({
  type: 'eintrag',
  id,
  area: homeArea,
  dog: { id: 10, name: 'Nele', name_unbekannt: false, rasse: null, foto_url: null },
  titel: `Beitrag ${id}`,
  text: 'Heute am See.',
  foto_urls: [],
  foto_anzahl: 0,
  datum: '2026-09-27',
  autor_name: 'Mara',
  created_at: '2026-09-27 10:00:00',
  activity_at: '2026-09-27 10:00:00',
  comment_count: 0,
  privat: false,
  ...extra
})
const zettel = (id, extra = {}) => ({
  type: 'zettel',
  id,
  area: homeArea,
  titel: null,
  text: 'Treffen am Deich',
  foto_urls: [],
  foto_anzahl: 0,
  datum: null,
  termin_datum: null,
  termin_zeit: null,
  autor_name: 'Mara',
  created_at: '2026-09-26 10:00:00',
  activity_at: '2026-09-26 10:00:00',
  comment_count: 0,
  privat: false,
  ...extra
})
const feed = (items = [], extra = {}) => ({ items, termine: [], notizen: 0, next: null, ...extra })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
  api.listDogs.mockResolvedValue([])
  api.start.mockResolvedValue(feed())
  api.erlebtMitOffen.mockResolvedValue([])
  api.visits.mockResolvedValue({ besuche: [], gaeste: [] })
  api.erlebtMitTiere.mockResolvedValue([])
  api.onThisDay.mockResolvedValue([])
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
  vi.useRealTimers()
})

async function render(family = atHome, themeId = 'standard') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <HinweiseProvider family={family} onFamilyChange={() => {}}>
            <StartPage family={family} onFamilyChange={() => {}} />
          </HinweiseProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

describe('StartPage (Phase W)', () => {
  test('Neuigkeiten: Karten mit Anriss, Fotos und Grüßen aus GET /api/start, je ein Link zur Erinnerung im Bereich', async () => {
    api.start.mockResolvedValue(
      feed([
        item(7, { foto_urls: ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg', '/uploads/d.jpg'], foto_anzahl: 6, comment_count: 2 }),
        item(6, { datum: '2026-09-26' })
      ])
    )
    await render()

    expect(api.start).toHaveBeenCalledWith()
    const cards = [...container.querySelectorAll('.feed-card')]
    expect(cards).toHaveLength(2)
    expect(cards[0].querySelector('a').getAttribute('href')).toBe('/tier/10?in=1#entry-7')
    expect(cards[0].querySelector('.feed-card-title').textContent).toBe('Beitrag 7')
    expect(cards[0].querySelector('.feed-card-dog').textContent).toBe('Nele')
    // B+ Familienalbum: das erste Foto als Polaroid, die übrigen als „+5“ (der Feed schickt höchstens vier mit)
    expect(cards[0].querySelectorAll('.feed-card-photo .polaroid img')).toHaveLength(1)
    expect(cards[0].querySelector('.feed-card-photo img').getAttribute('src')).toBe('/uploads/a.jpg')
    expect(cards[0].querySelector('.feed-card-more').textContent).toBe('+5')
    expect(cards[1].querySelector('.feed-card-photo')).toBeNull()
    expect(cards[0].querySelector('.feed-card-comments').textContent).toBe(`2 ${words.greetings}`)
    expect(cards[1].querySelector('.feed-card-comments')).toBeNull()
    // Im eigenen Zuhause kein Bereichs-Hinweis
    expect(container.querySelector('.feed-area-chip')).toBeNull()
    expect(container.querySelector('#start-news-title').textContent).toBe('Neue Erinnerungen')
  })

  test('ein Feed über alle Bereiche: jede Karte sagt, wo das Tier wohnt - Links öffnen den Bereich der Karte', async () => {
    const tier = (id, name, zuhause, extra = {}) => ({ id, name, name_unbekannt: false, rasse: null, foto_url: null, zuhause, ...extra })
    api.start.mockResolvedValue(
      feed([
        item(3, { area: familyArea, dog: tier(20, 'Wilma', 'Zuhause Möwenweg', { foto_url: '/uploads/wilma.jpg' }) }),
        item(4, { area: visitArea, datum: '2026-09-26', dog: tier(30, 'Socke', 'Zuhause Möwenweg') }),
        item(6, { area: familyArea, datum: '2026-09-26', dog: tier(40, 'Lotte', 'Familie Sonnenhang') }),
        item(5, { datum: '2026-09-25' })
      ])
    )
    await render()
    const cards = [...container.querySelectorAll('.feed-card')]
    expect(cards.map((card) => card.querySelector('a').getAttribute('href'))).toEqual([
      '/tier/20?in=5#entry-3',
      '/tier/30?in=8#entry-4',
      '/tier/40?in=5#entry-6',
      '/tier/10?in=1#entry-5'
    ])
    const chip = (card) => card.querySelector('.feed-area-chip')
    // Wilma ist über die Familie zu sehen, wohnt aber im Möwenweg - die Familie steht nur leise dabei (kein zweiter Chip).
    expect(chip(cards[0]).textContent).toBe('aus Zuhause Möwenweg, geteilt in Familie Sonnenhang')
    expect(chip(cards[0]).getAttribute('title')).toBe('geteilt in Familie Sonnenhang')
    expect(chip(cards[0]).querySelector('.visually-hidden').textContent).toBe(', geteilt in Familie Sonnenhang')
    expect(cards[0].querySelectorAll('.feed-area-chip')).toHaveLength(1)
    expect(chip(cards[1]).textContent).toBe('aus Zuhause Möwenweg')
    expect(chip(cards[1]).hasAttribute('title')).toBe(false)
    expect(chip(cards[2]).textContent).toBe('aus Familie Sonnenhang')
    expect(chip(cards[3])).toBeNull()
    expect(container.textContent).not.toContain('Zu Besuch:')
    expect(chip(cards[0]).classList.contains('is-familie')).toBe(true)
    expect(chip(cards[1]).classList.contains('is-besuch')).toBe(true)
    expect(cards[0].querySelector('.avatar img').getAttribute('src')).toBe('/uploads/wilma.jpg')
  })

  test('Neu an der Pinnwand: die zwei neuesten Zettel als kurze Zeilen (nicht im Album), ohne die Termine unter „Bald“', async () => {
    api.start.mockResolvedValue(
      feed(
        [
          zettel(1, { comment_count: 2, activity_at: '2026-09-28 09:00:00' }),
          item(2),
          zettel(1, { area: familyArea, text: 'Grillen im Garten', activity_at: '2026-09-27 09:00:00', comment_count: 1 }),
          zettel(4, { text: 'Impfung', termin_datum: '2026-10-14' }),
          zettel(5, { text: 'Vierter Zettel' }),
          zettel(6, { text: 'Fünfter Zettel' })
        ],
        { termine: [{ id: 4, text: 'Impfung', termin_datum: '2026-10-14', termin_zeit: null, area: homeArea }] }
      )
    )
    await render()
    const rows = [...container.querySelectorAll('.start-pinboard-link')]
    expect(rows.map((row) => [row.getAttribute('href'), row.querySelector('.start-pinboard-text').textContent])).toEqual([
      ['/pinnwand?in=home', 'Treffen am Deich'],
      ['/familien/5?reiter=pinnwand', 'Grillen im Garten']
    ])
    expect(rows[0].querySelector('.start-pinboard-meta').textContent).toBe('2 Antworten · heute')
    expect(rows[0].querySelector('.feed-area-chip')).toBeNull()
    expect(rows[1].querySelector('.feed-area-chip').textContent).toBe('Familie Sonnenhang')
    expect(rows[1].querySelector('.start-pinboard-meta').textContent).toBe('Familie Sonnenhang1 Antwort · gestern')
    // Zettel stehen nicht im Album darunter
    expect(container.querySelectorAll('.feed-card')).toHaveLength(1)
  })

  test('Zettel stehen im Kasten „Bald“ unter den Terminen; nur Zettel: der Kasten heißt „Neu an der Pinnwand“', async () => {
    api.start.mockResolvedValue(
      feed([zettel(1)], { termine: [{ id: 2, text: 'Impfung', termin_datum: '2026-10-14', termin_zeit: null, area: homeArea }] })
    )
    await render()
    let soon = container.querySelector('.start-soon')
    expect(soon.querySelector('h2').textContent).toBe('Bald')
    expect(soon.querySelector('.start-pinboard-title').textContent).toBe('Neu an der Pinnwand')
    act(() => root.unmount())
    root = null
    container.remove()

    api.start.mockResolvedValue(feed([zettel(1)]))
    await render()
    soon = container.querySelector('.start-soon')
    expect(soon.querySelector('h2').textContent).toBe('Neu an der Pinnwand')
    expect(soon.querySelector('.start-pinboard-title')).toBeNull()
    expect(soon.querySelector('.start-soon-list')).toBeNull()
    act(() => root.unmount())
    root = null
    container.remove()

    api.start.mockResolvedValue(feed([item(1)]))
    await render()
    expect(container.querySelector('.start-pinboard')).toBeNull()
  })

  test('zuerst fünf Erinnerungen, der Rest hinter "Weitere Erinnerungen" - danach steht der Fokus auf der ersten neuen', async () => {
    api.start.mockResolvedValue(feed(Array.from({ length: 9 }, (_, index) => item(index + 1, { activity_at: `2026-09-27 10:0${9 - index}:00` }))))
    await render()
    expect(container.querySelectorAll('.feed-card')).toHaveLength(5)
    const more = container.querySelector('.start-more')
    expect(more.textContent).toBe('Weitere Erinnerungen (4)')
    act(() => more.click())
    expect(container.querySelectorAll('.feed-card')).toHaveLength(9)
    expect(container.querySelector('.start-more')).toBeNull()
    expect(document.activeElement.getAttribute('href')).toBe('/tier/10?in=1#entry-6')
  })

  test('Ältere anzeigen: holt mit dem Cursor die nächste Seite und hängt sie darunter an, Fokus auf die erste neue', async () => {
    api.start.mockResolvedValueOnce(feed([item(1), item(2)], { next: '2026-09-27T10:00:00Z~e2' }))
    api.start.mockResolvedValueOnce(feed([item(2), item(3, { datum: '2026-09-30' }), item(4, { datum: '2026-09-29' })]))
    await render()
    const older = container.querySelector('.start-more')
    expect(older.textContent).toBe('Ältere anzeigen')
    await act(async () => older.click())
    expect(api.start).toHaveBeenLastCalledWith({ vor: '2026-09-27T10:00:00Z~e2' })
    // Die neue Seite steht darunter (nie dazwischen), schon Geladenes nicht doppelt
    const links = [...container.querySelectorAll('.feed-card a')].map((link) => link.getAttribute('href'))
    expect(links).toEqual(['/tier/10?in=1#entry-1', '/tier/10?in=1#entry-2', '/tier/10?in=1#entry-3', '/tier/10?in=1#entry-4'])
    expect(document.activeElement.getAttribute('href')).toBe('/tier/10?in=1#entry-3')
    expect(container.querySelector('.start-more')).toBeNull()
  })

  test('Ältere anzeigen: ein Fehler steht darunter, der Knopf bleibt für einen neuen Versuch', async () => {
    api.start.mockResolvedValueOnce(feed([item(1)], { next: '2026-09-27T10:00:00Z~e1' }))
    api.start.mockRejectedValueOnce(new Error('Keine Verbindung zum Server.'))
    await render()
    await act(async () => container.querySelector('.start-more').click())
    expect(container.querySelector('.start-more-error').textContent).toBe('Keine Verbindung zum Server.')
    expect(container.querySelector('.start-more').textContent).toBe('Ältere anzeigen')
  })

  test('Ältere anzeigen: ein zweiter Klick während des Ladens holt nichts doppelt; verlässt man Start, passiert nichts', async () => {
    let answer
    api.start.mockResolvedValueOnce(feed([item(1)], { next: '2026-09-27T10:00:00Z~e1' }))
    api.start.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await render()
    const older = container.querySelector('.start-more')
    await act(async () => older.click())
    expect(older.getAttribute('aria-disabled')).toBe('true')
    expect(older.textContent).toBe('Lädt …')
    await act(async () => older.click())
    expect(api.start).toHaveBeenCalledTimes(2)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => root.unmount())
    root = null
    await act(async () => answer(feed([item(2, { datum: '2026-09-20' })])))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  test('ohne Erinnerungen, aber mit weiteren Seiten: kein „Noch keine Erinnerungen“', async () => {
    api.start.mockResolvedValue(feed([zettel(1)], { next: '2026-09-27T10:00:00Z~e1' }))
    await render()
    expect(container.querySelector('.feed-empty')).toBeNull()
    expect(container.querySelector('.start-more').textContent).toBe('Ältere anzeigen')
  })

  test('kann der Feed nicht geladen werden: eine Fehlermeldung statt eines Leerzustands', async () => {
    api.start.mockRejectedValue(new Error('Fehler 500'))
    await render()
    expect(container.querySelector('.error-banner').textContent).toBe('Fehler 500')
    expect(container.querySelector('.feed-empty')).toBeNull()
    expect(container.querySelector('.start-news').getAttribute('aria-busy')).toBeNull()
  })

  test('ohne Beiträge ein freundlicher Leerzustand', async () => {
    await render()
    expect(container.querySelector('.start-news').textContent).toContain('Noch keine Erinnerungen.')
  })

  test('Erzählen: nur bearbeitbare, lebende Tiere zur Wahl; die Wahl öffnet den Beitrag-Dialog, der neue Beitrag steht oben', async () => {
    api.listDogs.mockResolvedValue([
      dog(10, 'Nele'),
      dog(11, 'Aiko', { bei_uns_bis: '2020-01-01' }),
      dog(12, 'Wilma', { can_edit: 0, shared_from: 'Zuhause Möwenweg' })
    ])
    api.createTimelineEntry.mockResolvedValue({ id: 99, dog_id: 10, titel: 'Erster Schnee', text: '', foto_urls: [], datum: '2026-09-28', created_at: '2026-09-28 11:00:00' })
    api.start.mockResolvedValue(feed([item(5, { area: familyArea })]))
    await render()

    const composer = container.querySelector('.start-composer')
    expect(composer.querySelector('h2').textContent).toBe('Was erlebt euer Tier?')
    // B+ Familienalbum: die Tiere stehen oben schon als Kreise - hier erst „Erinnerung festhalten“, dann die Wahl.
    expect(composer.querySelector('.start-composer-animal')).toBeNull()
    act(() => composer.querySelector('.start-composer-open').click())
    expect(composer.querySelector('.start-composer-open')).toBeNull()
    expect(document.activeElement).toBe(composer.querySelector('.start-composer-animal'))
    const choices = [...composer.querySelectorAll('.start-composer-animal')]
    // Der Name ohne den (für Screenreader verborgenen) Anfangsbuchstaben im Avatar
    expect(choices.map((button) => button.querySelector(':scope > span').textContent)).toEqual(['Nele'])
    // Abbrechen vor der Wahl: zu, der Fokus steht wieder auf „Erinnerung festhalten“
    act(() => composer.querySelector('.start-composer-cancel').click())
    expect(composer.querySelector('.start-composer-animal')).toBeNull()
    expect(document.activeElement).toBe(composer.querySelector('.start-composer-open'))
    act(() => composer.querySelector('.start-composer-open').click())
    const chips = () => [...composer.querySelectorAll('.start-composer-animal')]
    act(() => chips()[0].click())
    expect(chips()[0].getAttribute('aria-pressed')).toBe('true')
    // Abwählen lässt den Fokus, wo er ist - erneut wählen öffnet das Formular
    chips()[0].focus()
    act(() => chips()[0].click())
    expect(chips()[0].getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(chips()[0])
    act(() => chips()[0].click())

    const setValue = (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    act(() => {
      setValue(container.querySelector('[name="titel"]'), 'Erster Schnee')
      setValue(container.querySelector('[name="autorName"]'), 'Mara')
    })
    expect(container.querySelector('.entry-form button[type="submit"]').textContent).toBe(words.tellActionShort)
    await act(async () => container.querySelector('.entry-form').requestSubmit())

    expect(api.createTimelineEntry).toHaveBeenCalledWith(expect.objectContaining({ dogId: 10, titel: 'Erster Schnee' }))
    // Nach dem Speichern: zu, der Fokus zurück auf „Erinnerung festhalten“
    expect(document.activeElement).toBe(composer.querySelector('.start-composer-open'))
    expect(container.querySelector('.feed-card-title').textContent).toBe('Erster Schnee')
    expect(container.querySelector('.feed-card a').getAttribute('href')).toBe('/tier/10?in=1#entry-99')
    expect(container.querySelector('.feed-card').querySelector('.feed-area-chip')).toBeNull()
    expect(container.querySelectorAll('.feed-card')).toHaveLength(2)
  })

  test('Bald: Jahrestag innerhalb von 30 Tagen, Termine aus Zuhause und Familien und der Weg zu den Notizen', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele', { bei_uns_seit: '2021-10-05' })])
    api.start.mockResolvedValue(
      feed([], {
        notizen: 1,
        termine: [
          { id: 3, text: 'Altes Treffen', termin_datum: '2026-09-27', termin_zeit: null, area: homeArea },
          { id: 1, text: 'Geschwistertreffen', termin_datum: '2026-10-12', termin_zeit: null, area: familyArea },
          { id: 2, text: 'Impfung', termin_datum: '2026-10-14', termin_zeit: '10:30', area: homeArea }
        ]
      })
    )
    await render()

    const soon = container.querySelector('.start-soon')
    expect(soon.textContent).toContain('In 7 Tagen: Nele ist 5 Jahre bei euch')
    const termine = [...soon.querySelectorAll('.start-soon-termin')]
    // Vergangenes (nach der Uhr des Geräts) fällt heraus, höchstens drei
    const row = (link) => [
      link.getAttribute('href'),
      link.querySelector('strong').textContent,
      link.querySelector('.feed-area-chip')?.textContent ?? null,
      link.querySelector('.start-soon-text').textContent
    ]
    expect(termine.map(row)).toEqual([
      ['/familien/5?reiter=pinnwand', 'Mo, 12. Oktober', 'Familie Sonnenhang', 'Geschwistertreffen'],
      ['/pinnwand?in=home', 'Mi, 14. Oktober · 10:30 Uhr', null, 'Impfung']
    ])
    const notes = soon.querySelector('.start-card-link')
    expect(notes.getAttribute('href')).toBe('/pinnwand')
    expect(notes.textContent).toBe('Notizen (1) ')
  })

  test('ohne Termin, Notizen und nahen Jahrestag: kein Kasten "Bald"', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele', { bei_uns_seit: '2020-01-01' })])
    await render()
    expect(container.querySelector('.start-soon')).toBeNull()
  })

  test('Hinweise stehen nur in der Glocke oben rechts - Start zeigt weder Kästen noch eine Hinweis-Zeile', async () => {
    await render({ ...atHome, erlebtMitOffen: 1, neueGaeste: 1 })
    expect(container.querySelector('.start-foryou')).toBeNull()
    expect(container.querySelector('.start-hinweise')).toBeNull()
    expect(container.textContent).not.toContain('neue Hinweise')
    expect(api.erlebtMitOffen).not.toHaveBeenCalled()
    expect(api.visits).not.toHaveBeenCalled()
  })

  test('Meine Familien am Rand mit Rolle und Link zur Gruppenseite', async () => {
    await render()
    const card = container.querySelector('.start-families')
    expect(card.querySelector('h2').textContent).toBe('Meine Familien')
    const link = card.querySelector('a')
    expect(link.getAttribute('href')).toBe('/familien/5')
    expect(link.textContent).toBe('Familie SonnenhangMitglied')
  })

  test('Meine Familien: dieselbe Zählung wie überall (Phase W, Schritt 2)', async () => {
    await render({ ...atHome, memberships: [{ id: 5, name: 'Familie Sonnenhang', rolle: 'mitglied', tiere: 21, eigeneTiere: 4 }] })
    expect(container.querySelector('.start-family-count').textContent).toBe(`21 ${words.animals} · davon 4 von euch`)
  })

  test('klassischer Login: Neuigkeiten der Familie, kein Rand mit Familien, keine Notizen-Abkürzung', async () => {
    api.start.mockResolvedValue(feed([], { notizen: 1 }))
    await render(classic)
    expect(container.querySelector('h1').textContent).toBe('Start – Rudel vom Heidekamp')
    expect(container.querySelector('.start-families')).toBeNull()
    expect(container.querySelector('.start-soon')).toBeNull()
  })
})

// B+ Familienalbum: Begrüßung, „Eure Tiere“ als Kreise, „Heute vor einem Jahr“ und Kapitel nach Jahreszeiten.
describe('StartPage – Look B+ Familienalbum', () => {
  test('Begrüßung in Handschrift über dem Namen des Zuhauses', async () => {
    await render()
    expect(container.querySelector('.start-greeting-hand').textContent).toBe('Schön, dass ihr da seid')
    expect(container.querySelector('h1').textContent).toBe('Start – Zuhause Lindenhof')
  })

  test('Eure Tiere: Kreise mit Namen, verstorbene „In Erinnerung“, am Ende „Neu“ für ein neues Tier', async () => {
    api.listDogs.mockResolvedValue([
      dog(10, 'Nele'),
      dog(11, 'Balu', { bei_uns_bis: '2019-11-02', abschied_grund: 'verstorben' }),
      dog(12, 'Wilma', { can_edit: 0, shared_from: 'Zuhause Möwenweg' })
    ])
    await render()
    const circles = [...container.querySelectorAll('.animal-circles a.animal-circle')]
    expect(circles.map((link) => [link.getAttribute('href'), link.querySelector('.animal-circle-name').textContent])).toEqual([
      ['/tier/10', 'Nele'],
      ['/tier/11', 'Balu']
    ])
    expect(circles[1].classList.contains('is-memorial')).toBe(true)
    expect(circles[1].textContent).toContain('In Erinnerung')
    const add = container.querySelector('.animal-circle.is-new')
    expect(add.getAttribute('aria-label')).toBe('Neues Tier anlegen')
    act(() => add.click())
    expect(document.querySelector('dialog[open]')?.textContent).toContain('Neues Tier anlegen')
  })

  test('ohne Schreibrecht kein „Neu“', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele')])
    await render({ ...atHome, role: 'gast' })
    expect(container.querySelectorAll('.animal-circles a')).toHaveLength(1)
    expect(container.querySelector('.animal-circle.is-new')).toBeNull()
  })

  test('Heute vor einem Jahr: nur mit Erinnerung vom selben Tag, als Polaroid mit „Wieder ansehen“', async () => {
    await render()
    expect(api.onThisDay).toHaveBeenCalledWith('2026-09-28')
    expect(container.querySelector('.on-this-day')).toBeNull()
    act(() => root.unmount())
    root = null
    container.remove()

    api.onThisDay.mockResolvedValue([entry(3, { titel: 'Nele im ersten Schnee', datum: '2025-09-28', foto_urls: ['/uploads/schnee.jpg'] })])
    await render()
    const card = container.querySelector('.on-this-day')
    expect(card.querySelector('h2').textContent).toBe('Heute vor einem Jahr')
    expect(card.querySelector('.on-this-day-title').textContent).toBe('Nele im ersten Schnee')
    expect(card.querySelector('.polaroid img').getAttribute('src')).toBe('/uploads/schnee.jpg')
    expect(card.querySelector('a').getAttribute('href')).toBe('/tier/10#entry-3')
  })

  test('Heute vor einem Jahr: zu Besuch keine Anfrage; verlässt man Start, bevor die Antwort da ist, passiert nichts', async () => {
    await render({ ...atHome, zuBesuch: true })
    expect(api.onThisDay).not.toHaveBeenCalled()
    act(() => root.unmount())
    root = null
    container.remove()

    let answer
    api.onThisDay.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await render()
    act(() => root.unmount())
    root = null
    await act(async () => answer([entry(3, { datum: '2025-09-28' })]))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  test('Kapitel: nach dem Tag der Erinnerung sortiert, je Jahreszeit ein Kapitel - auch wenn sie anders festgehalten wurden', async () => {
    // /api/start liefert nach letzter Aktivität: die Sommer-Erinnerung zuletzt gegrüßt, dazwischen eine aus dem Herbst
    api.start.mockResolvedValue(
      feed([
        item(1, { datum: '2026-07-14', comment_count: 1, activity_at: '2026-09-28 10:00:00' }),
        item(3, { datum: '2026-09-20', activity_at: '2026-09-27 10:00:00' }),
        item(2, { datum: '2026-09-02', activity_at: '2026-09-26 10:00:00' })
      ])
    )
    await render()
    const chapters = [...container.querySelectorAll('.feed-chapter')]
    expect(chapters.map((chapter) => chapter.querySelector('.feed-chapter-label').textContent)).toEqual(['Herbst 2026', 'Sommer 2026'])
    expect(chapters.map((chapter) => chapter.querySelectorAll('.feed-card').length)).toEqual([2, 1])
    expect(chapters[0].querySelector('ul').getAttribute('aria-label')).toBe('Herbst 2026')
    expect(chapters[1].querySelector('.feed-card-comments svg')).not.toBeNull()
    // Die Zeile unter dem Tier nennt den Tag der Erinnerung - passend zum Kapitel
    expect(chapters[0].querySelector('.feed-card-meta').textContent).toBe('erzählt von Mara · 20. September 2026')
    expect(chapters[1].querySelector('.feed-card-meta').textContent).toBe('erzählt von Mara · 14. Juli 2026')
  })

  test('Bilderrahmen-Karte nur mit Fotos aus dem eigenen Zuhause', async () => {
    api.start.mockResolvedValue(feed([item(1, { area: familyArea, foto_urls: ['/uploads/familie.jpg'], foto_anzahl: 1 })]))
    await render()
    expect(container.querySelector('.start-frame')).toBeNull()
    act(() => root.unmount())
    root = null
    container.remove()

    api.start.mockResolvedValue(feed([item(1, { foto_urls: ['/uploads/zuhause.jpg'], foto_anzahl: 1 })]))
    await render()
    expect(container.querySelector('.start-frame img').getAttribute('src')).toBe('/uploads/zuhause.jpg')
  })
})
