// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { posts, createPost, updatePost, deletePost, uploadPostImage, cardAnzeigen } = vi.hoisted(() => ({
  posts: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  uploadPostImage: vi.fn(),
  // Phase V1: "Eure Karte in Entdecken" (PartnerCardOrder) - ohne eigene Vorgabe keine Karte.
  cardAnzeigen: vi.fn(() => Promise.resolve({ bereich: null, max: 3, anzeigen: [] }))
}))
vi.mock('../api', () => ({ api: { partnerArea: { posts, createPost, updatePost, deletePost, uploadPostImage, cardAnzeigen } } }))

import PartnerPostsPage from './PartnerPostsPage.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const schoolFamily = {
  id: 30,
  name: 'Hundeschule Wiesengrund',
  art: 'partner',
  partner: { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'aktiv', gesperrt: false, unread: 0 }
}

function familyOfTyp(typ) {
  return { ...schoolFamily, partner: { ...schoolFamily.partner, typ } }
}

function post(overrides) {
  return {
    id: 1,
    bereich: 'hundeschule',
    kennzeichnung: 'Anzeige',
    titel: 'Welpenkurs ab Oktober',
    text: 'Sechs Termine, kleine Gruppen.',
    url: 'https://example.org/welpenkurs',
    tierart: null,
    aktiv: true,
    start: '2026-10-01',
    ende: '2026-11-15',
    bildUrl: null,
    freigabe: 'freigegeben',
    ablehnungsgrund: null,
    clicks7: 3,
    clicksTotal: 12,
    createdAt: '2026-09-20 10:00:00',
    ...overrides
  }
}

const threePosts = [
  post({ id: 3, titel: 'Tag der offenen Tür', freigabe: 'eingereicht', aktiv: false, start: null, ende: null, clicks7: 0, clicksTotal: 0 }),
  post({ id: 2, titel: 'Agility-Schnupperstunde', freigabe: 'abgelehnt', ablehnungsgrund: 'Bitte ohne Preisangaben im Titel.' }),
  post({ id: 1 })
]

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  nativeSelectValueSetter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
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
  for (const mock of [posts, createPost, updatePost, deletePost, uploadPostImage]) mock.mockReset()
})

async function render({ list = threePosts, family = schoolFamily, isDemo = false } = {}) {
  posts.mockResolvedValue(list)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={isDemo}>
          <PartnerPostsPage family={family} />
        </DemoProvider>
      </MemoryRouter>
    )
  )
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

function row(titel) {
  return [...container.querySelectorAll('.partner-post')].find((li) => li.querySelector('h3').textContent === titel)
}

async function click(element) {
  await act(async () => element.click())
}

async function submit() {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('PartnerPostsPage – Liste', () => {
  test('zeigt Hinweis, Zähler "x von 20" und je Beitrag Freigabe, aktiv, Zeitraum und Klicks', async () => {
    await render()

    expect(container.querySelector('h1').textContent).toBe('Beiträge')
    expect(container.textContent).toContain(
      'Beiträge erscheinen nach Freigabe durch uns als ‚Anzeige‘ bei Menschen in eurer Nähe. Jede Änderung wird erneut geprüft.'
    )
    expect(container.querySelector('.partner-posts-count').textContent).toBe('3 von 20')

    const waiting = row('Tag der offenen Tür')
    expect(waiting.querySelector('.freigabe-chip').textContent).toBe('Wartet auf Freigabe')
    expect(waiting.querySelector('.partner-post-aktiv').textContent).toBe('Inaktiv')
    expect(waiting.textContent).toContain('unbefristet')

    const rejected = row('Agility-Schnupperstunde')
    expect(rejected.querySelector('.freigabe-chip').textContent).toBe('Abgelehnt')
    expect(rejected.querySelector('.partner-post-reason').textContent).toContain('Bitte ohne Preisangaben im Titel.')

    const approved = row('Welpenkurs ab Oktober')
    expect(approved.querySelector('.freigabe-chip').textContent).toBe('Freigegeben')
    expect(approved.querySelector('.partner-post-aktiv').textContent).toBe('Aktiv')
    expect(approved.textContent).toContain('01.10.2026 – 15.11.2026')
    expect(approved.querySelector('.partner-post-clicks').textContent).toBe('3 / 12')
    expect(approved.textContent).toContain('Klicks 7 Tage / gesamt')
    expect(approved.querySelector('.partner-post-reason')).toBeNull()
  })

  test('ohne Beiträge: freundlicher Leerzustand', async () => {
    await render({ list: [] })
    expect(container.querySelector('.partner-posts-count').textContent).toBe('0 von 20')
    expect(container.textContent).toContain('Noch keine Beiträge')
  })

  test('bei 20 Beiträgen lässt sich kein weiterer anlegen', async () => {
    await render({ list: Array.from({ length: 20 }, (_, index) => post({ id: index + 1, titel: `Kurs ${index + 1}` })) })
    expect(button('Beitrag anlegen').disabled).toBe(true)
    expect(container.textContent).toContain('Höchstens 20 Beiträge')
  })

  // Audit W: die Seite bleibt kurz - sechs Beiträge zuerst, der Rest auf Wunsch; das Formular öffnet erst auf Klick.
  test('zeigt zuerst sechs Beiträge, dann „Weitere Beiträge (n)“ - aufgeklappt alle; kein Formular ohne Klick', async () => {
    await render({ list: Array.from({ length: 8 }, (_, index) => post({ id: index + 1, titel: `Kurs ${index + 1}` })) })
    expect(container.querySelectorAll('.partner-post')).toHaveLength(6)
    expect(container.querySelector('form')).toBeNull()
    const more = button('Weitere Beiträge (2)')
    await click(more)
    expect(container.querySelectorAll('.partner-post')).toHaveLength(8)
    expect(button('Weitere Beiträge (2)')).toBeUndefined()
  })

  test('mit bis zu sechs Beiträgen kein „Weitere“-Knopf', async () => {
    await render()
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.startsWith('Weitere Beiträge'))).toBe(false)
  })
})

describe('PartnerPostsPage – Anlegen', () => {
  test('Hundeschule: Bereich ist vorgewählt, das Anlegen schickt bereich "hundeschule" und reiht den Beitrag oben ein', async () => {
    const created = post({ id: 9, titel: 'Junghunde-Kurs', freigabe: 'eingereicht', clicks7: 0, clicksTotal: 0 })
    createPost.mockResolvedValue(created)
    await render()

    await click(button('Beitrag anlegen'))
    const select = container.querySelector('#post-bereich')
    expect([...select.options].map((option) => option.value)).toEqual(['hundeschule'])
    expect(select.value).toBe('hundeschule')
    // Ein Bild gibt es erst nach dem ersten Speichern.
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(container.textContent).toContain('Ein Bild könnt ihr nach dem Speichern')

    setInputValue(container.querySelector('#post-titel'), 'Junghunde-Kurs')
    await submit()

    expect(createPost).toHaveBeenCalledWith({
      titel: 'Junghunde-Kurs',
      text: null,
      bereich: 'hundeschule',
      url: null,
      start: null,
      ende: null,
      aktiv: true,
      zeitraeume: []
    })
    expect(container.querySelector('.partner-post h3').textContent).toBe('Junghunde-Kurs')
    expect(container.querySelector('.partner-posts-count').textContent).toBe('4 von 20')
  })

  test.each([
    ['tierheim', ['', 'begleiter', 'unterstuetzen']],
    ['sonstige', ['', 'unterstuetzen', 'futter']],
    ['hundesalon', ['salon']],
    ['betreuung', ['salon']],
    ['futter', ['futter']]
  ])('Typ %s: nur die erlaubten Bereiche %j', async (typ, values) => {
    await render({ list: [], family: familyOfTyp(typ) })
    await click(button('Beitrag anlegen'))
    expect([...container.querySelector('#post-bereich').options].map((option) => option.value)).toEqual(values)
  })

  test('mit mehreren Bereichen muss einer gewählt werden - der gewählte geht an den Server', async () => {
    createPost.mockResolvedValue(post({ id: 9, bereich: 'unterstuetzen', freigabe: 'eingereicht' }))
    await render({ list: [], family: familyOfTyp('tierheim') })
    await click(button('Beitrag anlegen'))
    setInputValue(container.querySelector('#post-titel'), 'Patenschaften gesucht')

    await submit()
    expect(createPost).not.toHaveBeenCalled()
    expect(container.querySelector('#post-bereich').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(container.querySelector('#post-bereich'))

    setSelectValue(container.querySelector('#post-bereich'), 'unterstuetzen')
    await submit()
    expect(createPost.mock.calls[0][0].bereich).toBe('unterstuetzen')
  })

  test('eine Server-Meldung zum Bereich steht am Feld', async () => {
    createPost.mockRejectedValue(Object.assign(new Error('Dieser Bereich passt nicht zu eurem Partner-Typ.'), { status: 400 }))
    await render({ list: [] })
    await click(button('Beitrag anlegen'))
    setInputValue(container.querySelector('#post-titel'), 'Welpenkurs')
    await submit()

    expect(container.querySelector('#post-bereich-error').textContent).toBe('Dieser Bereich passt nicht zu eurem Partner-Typ.')
  })
})

describe('PartnerPostsPage – Bearbeiten und Löschen', () => {
  test('Bearbeiten zeigt den Hinweis zur erneuten Prüfung und das Bild (nur JPG/PNG); Speichern schickt PUT', async () => {
    updatePost.mockResolvedValue(post({ titel: 'Welpenkurs ab November', freigabe: 'eingereicht' }))
    await render()

    await click(row('Welpenkurs ab Oktober').querySelector('button[aria-label="Welpenkurs ab Oktober bearbeiten"]'))
    expect(container.querySelector('.partner-post-resubmit').textContent).toBe(
      'Nach dem Speichern prüfen wir den Beitrag erneut – bis zur Freigabe ist er nicht öffentlich.'
    )
    expect(container.querySelector('input[type="file"]').getAttribute('accept')).toBe('image/png,image/jpeg')
    expect(container.querySelector('#post-titel').value).toBe('Welpenkurs ab Oktober')

    setInputValue(container.querySelector('#post-titel'), 'Welpenkurs ab November')
    await submit()

    expect(updatePost).toHaveBeenCalledWith(1, expect.objectContaining({ titel: 'Welpenkurs ab November', bereich: 'hundeschule' }))
    const updated = row('Welpenkurs ab November')
    expect(updated.querySelector('.freigabe-chip').textContent).toBe('Wartet auf Freigabe')
  })

  test('Löschen braucht eine Bestätigung', async () => {
    deletePost.mockResolvedValue(null)
    await render()

    const remove = row('Tag der offenen Tür').querySelector('.btn-danger')
    await click(remove)
    expect(deletePost).not.toHaveBeenCalled()
    expect(remove.textContent).toBe('Wirklich löschen?')

    await click(remove)
    expect(deletePost).toHaveBeenCalledWith(3)
    expect(row('Tag der offenen Tür')).toBeUndefined()
    expect(container.querySelector('.partner-posts-count').textContent).toBe('2 von 20')
  })
})

// V-Fehler 3: klarer Status, Grund vor dem Formular, "Erneut einreichen", Verlauf und vertrauenswürdige Partner.
describe('PartnerPostsPage – Freigabe-Verlauf und erneut einreichen', () => {
  const verlauf = [
    { id: 1, aktion: 'eingereicht', grund: null, createdAt: '2026-09-25 10:00:00' },
    { id: 2, aktion: 'geaendert', grund: null, createdAt: '2026-09-26 10:00:00' },
    { id: 3, aktion: 'abgelehnt', grund: 'Bitte ohne Preisangaben im Titel.', createdAt: '2026-09-27 10:00:00' }
  ]
  const withVerlauf = [threePosts[0], { ...threePosts[1], verlauf }, threePosts[2]]

  test('abgelehnt: "Erneut einreichen" statt "Bearbeiten"; das Formular zeigt den Grund oben und reicht ausdrücklich erneut ein', async () => {
    updatePost.mockResolvedValue(post({ id: 2, titel: 'Agility-Schnupperstunde', freigabe: 'eingereicht', verlauf: [...verlauf, { id: 4, aktion: 'eingereicht', grund: null, createdAt: '2026-09-28 10:00:00' }] }))
    await render({ list: withVerlauf })

    const rejected = row('Agility-Schnupperstunde')
    expect(rejected.querySelector('button[aria-label="Agility-Schnupperstunde bearbeiten"]')).toBeNull()
    const resubmit = rejected.querySelector('button[aria-label="Agility-Schnupperstunde erneut einreichen"]')
    expect(resubmit.textContent.trim()).toBe('Erneut einreichen')
    expect(rejected.querySelector('.partner-post-reason').textContent).toContain('Bitte anpassen und erneut einreichen.')

    await click(resubmit)
    const banner = container.querySelector('.partner-post-rejected')
    expect(banner.textContent).toContain('Abgelehnt')
    expect(banner.textContent).toContain('Bitte ohne Preisangaben im Titel.')
    const form = container.querySelector('form')
    expect(form.firstElementChild.nextElementSibling).toBe(banner)
    expect(container.querySelector('.partner-post-resubmit').textContent).toBe(
      'Passt den Beitrag an und reicht ihn erneut ein – bis zur Freigabe ist er nicht öffentlich.'
    )
    expect(form.querySelector('button[type="submit"]').textContent).toBe('Erneut einreichen')

    await submit()
    expect(updatePost).toHaveBeenCalledWith(2, expect.objectContaining({ titel: 'Agility-Schnupperstunde' }))
    expect(row('Agility-Schnupperstunde').querySelector('.freigabe-chip').textContent).toBe('Wartet auf Freigabe')
    expect(row('Agility-Schnupperstunde').querySelector('.partner-post-verlauf summary').textContent).toContain('Erneut eingereicht')
  })

  test('abgelehnt: ein neues Bild reicht schon ein - das offene Formular folgt (kein "Erneut einreichen" mehr), Eingaben bleiben', async () => {
    uploadPostImage.mockResolvedValue(
      post({ id: 2, titel: 'Agility-Schnupperstunde', freigabe: 'eingereicht', ablehnungsgrund: null, bildUrl: '/partner-media/neu.png' })
    )
    await render({ list: withVerlauf })

    await click(row('Agility-Schnupperstunde').querySelector('button[aria-label="Agility-Schnupperstunde erneut einreichen"]'))
    setInputValue(container.querySelector('#post-titel'), 'Agility für Einsteiger')
    const fileInput = container.querySelector('input[type="file"]')
    const file = new File(['x'], 'bild.png', { type: 'image/png' })
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(uploadPostImage).toHaveBeenCalledWith(2, file)
    expect(container.querySelector('.partner-post-rejected')).toBeNull()
    expect(container.querySelector('.partner-post-resubmit').textContent).toBe(
      'Der Beitrag wartet noch auf die Freigabe – eure Änderung prüfen wir gleich mit.'
    )
    expect(container.querySelector('form button[type="submit"]').textContent).toBe('Speichern')
    expect(container.querySelector('#post-titel').value).toBe('Agility für Einsteiger')
  })

  test('der Verlauf als kleine Zeitleiste - zugeklappt mit dem jüngsten Eintrag, aufgeklappt mit Grund', async () => {
    await render({ list: withVerlauf })

    const details = row('Agility-Schnupperstunde').querySelector('details.partner-post-verlauf')
    expect(details.open).toBe(false)
    expect(details.querySelector('summary').textContent).toContain('Verlauf')
    expect(details.querySelector('summary').textContent).toContain('Abgelehnt')
    const items = [...details.querySelectorAll('.freigabe-verlauf-item')]
    expect(items.map((item) => item.querySelector('.freigabe-verlauf-label').textContent)).toEqual(['Eingereicht', 'Geändert', 'Abgelehnt'])
    expect(items[2].querySelector('.freigabe-verlauf-grund').textContent).toBe('Bitte ohne Preisangaben im Titel.')
    // Ohne Verlauf (ältere Antwort) gibt es keine leere Zeitleiste.
    expect(row('Welpenkurs ab Oktober').querySelector('.partner-post-verlauf')).toBeNull()
  })

  test('Status je Beitrag mit Symbol und Text', async () => {
    await render()
    expect(row('Tag der offenen Tür').querySelector('.freigabe-chip svg')).not.toBeNull()
    expect([...container.querySelectorAll('.freigabe-chip')].map((chip) => chip.textContent)).toEqual(['Wartet auf Freigabe', 'Abgelehnt', 'Freigegeben'])
  })
})

describe('PartnerPostsPage – vertrauenswürdige Partner', () => {
  const trustedFamily = { ...schoolFamily, partner: { ...schoolFamily.partner, vertrauenswuerdig: true } }

  test('Hinweis oben; Änderungen an freigegebenen Beiträgen gehen sofort online, eingereichte warten weiter', async () => {
    updatePost.mockResolvedValue(post({ titel: 'Welpenkurs ab November', freigabe: 'freigegeben' }))
    await render({ family: trustedFamily })

    expect(container.querySelector('.partner-posts-trusted').textContent).toBe('Änderungen an freigegebenen Beiträgen gehen sofort online.')
    expect(container.querySelector('.partner-posts-hint').textContent).not.toContain('Jede Änderung wird erneut geprüft.')

    await click(row('Tag der offenen Tür').querySelector('button[aria-label="Tag der offenen Tür bearbeiten"]'))
    expect(container.querySelector('.partner-post-resubmit').textContent).toBe('Der Beitrag wartet noch auf die Freigabe – eure Änderung prüfen wir gleich mit.')
    await click(button('Abbrechen'))

    await click(row('Welpenkurs ab Oktober').querySelector('button[aria-label="Welpenkurs ab Oktober bearbeiten"]'))
    expect(container.querySelector('.partner-post-resubmit').textContent).toBe('Änderungen an freigegebenen Beiträgen gehen sofort online.')
    expect(container.querySelector('form button[type="submit"]').textContent).toBe('Speichern')
    setInputValue(container.querySelector('#post-titel'), 'Welpenkurs ab November')
    await submit()
    expect(row('Welpenkurs ab November').querySelector('.freigabe-chip').textContent).toBe('Freigegeben')
  })

  test('ohne Vertrauen kein Hinweis', async () => {
    await render()
    expect(container.querySelector('.partner-posts-trusted')).toBeNull()
  })
})

describe('PartnerPostsPage – Demo', () => {
  test('alles sichtbar, aber Anlegen, Bearbeiten und Löschen sind gesperrt', async () => {
    await render({ isDemo: true })

    expect(container.querySelectorAll('.partner-post')).toHaveLength(3)
    expect(button('Beitrag anlegen').disabled).toBe(true)
    expect(container.querySelector('#partner-posts-demo-hint').textContent).toBe('In der Demo nicht möglich.')
    const actions = [...container.querySelectorAll('.partner-post-actions button')]
    expect(actions.length).toBe(6)
    expect(actions.every((btn) => btn.disabled)).toBe(true)
    expect(actions.every((btn) => btn.getAttribute('aria-describedby') === 'partner-posts-demo-hint')).toBe(true)
  })
})

// Phase V1: über der Liste "Eure Karte in Entdecken" - nach einer Änderung an den Beiträgen neu geladen.
describe('PartnerPostsPage – Eure Karte in Entdecken', () => {
  test('steht über der Liste und lädt nach dem Löschen eines Beitrags neu', async () => {
    cardAnzeigen.mockClear()
    cardAnzeigen.mockResolvedValue({
      bereich: 'hundeschule',
      max: 3,
      anzeigen: [{ id: 1, titel: 'Welpenkurs ab Oktober', text: null, kennzeichnung: 'Anzeige', reihenfolge: null, inEntdecken: true, sichtbar: true, vomTeam: false, aufKarte: true }]
    })
    deletePost.mockResolvedValue(null)
    await render()
    const panel = container.querySelector('.partner-card-order')
    expect(panel.querySelector('h3').textContent).toBe('Eure Karte in Entdecken')
    // Audit W: zugeklappt, die Überschrift ist die Zusammenfassung.
    expect(panel.tagName).toBe('DETAILS')
    expect(panel.open).toBe(false)
    expect(panel.querySelector('summary h3')).not.toBeNull()
    expect(Boolean(panel.compareDocumentPosition(container.querySelector('.partner-post-list')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(cardAnzeigen).toHaveBeenCalledTimes(1)

    await click(row('Tag der offenen Tür').querySelector('button[aria-label="Tag der offenen Tür löschen"]'))
    await click([...row('Tag der offenen Tür').querySelectorAll('button')].find((btn) => btn.textContent.includes('Wirklich löschen?')))
    expect(cardAnzeigen).toHaveBeenCalledTimes(2)
    cardAnzeigen.mockResolvedValue({ bereich: null, max: 3, anzeigen: [] })
  })
})

// Phase V4a: mehrere Termine je Anzeige - Zeilen hinzufügen und entfernen, ein Fehler steht am Feld.
describe('PartnerPostsPage – Termine einer Anzeige', () => {
  test('zwei Termine anlegen, einen leeren weglassen - das Ende vor dem Beginn meldet das Formular', async () => {
    createPost.mockResolvedValue(post({ id: 9, titel: 'Tag der offenen Tür', freigabe: 'eingereicht' }))
    await render()
    await click(button('Beitrag anlegen'))
    setInputValue(container.querySelector('#post-titel'), 'Tag der offenen Tür')

    for (let i = 0; i < 3; i += 1) await click(button('Termin hinzufügen'))
    const dateInputs = () => [...container.querySelectorAll('.post-zeitraeume-row input[type="date"]')]
    expect(dateInputs()).toHaveLength(6)
    expect(container.querySelector('.post-zeitraeume-row label span').textContent).toBe('Termin 1: am bzw. ab')
    setInputValue(dateInputs()[0], '2026-11-01')
    setInputValue(dateInputs()[2], '2026-12-10')
    setInputValue(dateInputs()[3], '2026-12-05')
    await submit()
    expect(createPost).not.toHaveBeenCalled()
    expect(container.querySelector('#post-zeitraeume-error').textContent).toBe('Termin 2: das Ende darf nicht vor dem Beginn liegen')

    setInputValue(dateInputs()[3], '2026-12-12')
    await click(container.querySelector('[aria-label="Termin 3 entfernen"]'))
    expect(dateInputs()).toHaveLength(4)
    await submit()
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Tag der offenen Tür',
        zeitraeume: [
          { von: '2026-11-01', bis: null },
          { von: '2026-12-10', bis: '2026-12-12' }
        ]
      })
    )
  })

  test('die Liste zeigt die Termine eines Beitrags', async () => {
    await render({ list: [post({ id: 5, titel: 'Flohmarkt', zeitraeume: [{ von: '2099-02-01', bis: null }, { von: '2099-05-05', bis: '2099-05-10' }] })] })
    const meta = [...row('Flohmarkt').querySelectorAll('.partner-post-meta > div')].find((div) => div.querySelector('dt').textContent === 'Termine')
    expect(meta.querySelector('dd').textContent).toBe('1.2.2099, 5.–10.5.2099')
  })
})
