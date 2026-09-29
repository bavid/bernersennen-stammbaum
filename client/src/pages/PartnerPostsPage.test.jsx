// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { posts, createPost, updatePost, deletePost, uploadPostImage } = vi.hoisted(() => ({
  posts: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  uploadPostImage: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: { posts, createPost, updatePost, deletePost, uploadPostImage } } }))

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
      aktiv: true
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
