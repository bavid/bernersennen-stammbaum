// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ createDog: vi.fn(), upload: vi.fn() }))
vi.mock('../api', () => ({ api }))

import QuickAnimalForm from './QuickAnimalForm.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function setValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

async function render(props = {}, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider>
        <DemoProvider value={isDemo}>
          <QuickAnimalForm allDogs={[]} onCreated={() => {}} onCancel={() => {}} {...props} />
        </DemoProvider>
      </ThemeProvider>
    )
  )
  return container
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  Object.values(api).forEach((fn) => fn.mockReset())
})

const field = (name) => container.querySelector(`[name="${name}"]`)
const chip = (label) => [...container.querySelectorAll('.tierart-chip')].find((el) => el.textContent === label)
const choose = (label) => act(() => chip(label).querySelector('input').click())
const submit = () => act(async () => container.querySelector('form').requestSubmit())
const openMore = () => act(() => container.querySelector('.mehr-angaben-knopf').click())

describe('Neues Tier – nur Tierart und Name', () => {
  test('große Chips für die Tierart, keine Vorauswahl; Name hat den Fokus; Rest zugeklappt', async () => {
    await render()
    expect([...container.querySelectorAll('.tierart-chip')].map((el) => el.textContent)).toEqual(['Hund', 'Katze', 'Kaninchen', 'Vogel', 'Pferd', 'Anderes'])
    expect(container.querySelectorAll('.tierart-chip input:checked')).toHaveLength(0)
    expect(document.activeElement).toBe(field('name'))
    const more = container.querySelector('.mehr-angaben-knopf')
    expect(more.textContent).toContain('Mehr Angaben')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(field('geburtsdatum')).toBeNull()
    expect(container.querySelector('button[type="submit"]').textContent).toBe('Tier anlegen')
  })

  test('ohne Tierart und Namen: Fehler am Feld, Fokus auf die Tierart, nichts wird angelegt', async () => {
    await render()
    await submit()
    expect(api.createDog).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bitte wähle eine Tierart.')
    expect(container.textContent).toContain('Bitte gib einen Namen an – oder wähle „Name unbekannt“.')
    expect(document.activeElement).toBe(chip('Hund').querySelector('input'))
    expect(field('name').getAttribute('aria-invalid')).toBe('true')
  })

  test('Kaninchen: legt ein „anderes“ Tier mit der Art als Rasse an - nur mit Name und Tierart', async () => {
    const onCreated = vi.fn()
    api.createDog.mockResolvedValue({ id: 9, name: 'Hoppel' })
    await render({ onCreated })
    choose('Kaninchen')
    expect(chip('Kaninchen').classList.contains('is-selected')).toBe(true)
    act(() => setValue(field('name'), 'Hoppel'))
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hoppel', tierart: 'anderes', rasse: 'Kaninchen', geschlecht: 'unbekannt' }))
    expect(onCreated).toHaveBeenCalledWith({ id: 9, name: 'Hoppel' })
  })

  test('„Anderes“ fragt „Welches Tier?“ (optional)', async () => {
    api.createDog.mockResolvedValue({ id: 1, name: 'Kurt' })
    await render()
    expect(field('artText')).toBeNull()
    choose('Anderes')
    act(() => setValue(field('artText'), 'Schildkröte'))
    act(() => setValue(field('name'), 'Kurt'))
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(expect.objectContaining({ tierart: 'anderes', rasse: 'Schildkröte' }))
  })

  test('„Name unbekannt“ legt ohne Namen an', async () => {
    api.createDog.mockResolvedValue({ id: 2, name: 'Unbekannt' })
    await render()
    choose('Hund')
    act(() => field('nameUnbekannt').click())
    expect(field('name').disabled).toBe(true)
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(expect.objectContaining({ name: '', nameUnbekannt: true }))
  })
})

describe('Neues Tier – Foto und „Mehr Angaben“', () => {
  test('rundes Porträt: hochladen, Vorschau, entfernen; die Adresse geht als fotoUrl mit', async () => {
    api.upload.mockResolvedValue({ url: '/uploads/p.jpg' })
    api.createDog.mockResolvedValue({ id: 3, name: 'Benno' })
    await render()
    const input = container.querySelector('.portrait-feld input[type="file"]')
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })], configurable: true })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(container.querySelector('.portrait-feld img').getAttribute('src')).toBe('/uploads/p.jpg')
    choose('Hund')
    act(() => setValue(field('name'), 'Benno'))
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(expect.objectContaining({ fotoUrl: '/uploads/p.jpg' }))
  })

  test('Geschlecht steht sichtbar neben dem Namen: weiblich · männlich · weiß ich nicht, vorbelegt mit „weiß ich nicht“', async () => {
    await render()
    const sexButtons = () => [...container.querySelectorAll('.quick-animal-sex button')]
    expect(sexButtons().map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['weiblich', 'false'],
      ['männlich', 'false'],
      ['weiß ich nicht', 'true']
    ])
    // Dieselben Worte für jede Tierart.
    choose('Katze')
    expect(sexButtons().map((b) => b.textContent)).toEqual(['weiblich', 'männlich', 'weiß ich nicht'])
    act(() => sexButtons()[0].click())
    expect(sexButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  test('ohne Wahl geht „weiß ich nicht“ an den Server - nie still „weiblich“', async () => {
    api.createDog.mockResolvedValue({ id: 5, name: 'Pepper' })
    await render()
    choose('Hund')
    act(() => setValue(field('name'), 'Pepper'))
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pepper', tierart: 'hund', geschlecht: 'unbekannt' }))
  })

  test('ein Fehler verschwindet nur mit seinem eigenen Feld', async () => {
    await render()
    await submit()
    act(() => setValue(field('name'), 'Benno'))
    expect(container.textContent).toContain('Bitte wähle eine Tierart.')
    expect(container.textContent).not.toContain('Bitte gib einen Namen an')
  })

  test('„Mehr Angaben“: Rasse, Geburtstag, bei uns seit, Beschreibung - und das gewählte Geschlecht', async () => {
    api.createDog.mockResolvedValue({ id: 4, name: 'Benno' })
    await render()
    choose('Hund')
    expect(container.querySelector('.mehr-angaben-summary').textContent).toBe('Rasse, Geburtstag, Eltern …')
    act(() => [...container.querySelectorAll('.quick-animal-sex button')].find((b) => b.textContent === 'männlich').click())
    openMore()
    act(() => setValue(field('rasse'), 'Hovawart'))
    act(() => setValue(field('geburtsdatum'), '2024-03-01'))
    act(() => setValue(field('beiUnsSeit'), '2024-05-01'))
    act(() => setValue(field('beschreibung'), 'Frech und lieb'))
    act(() => setValue(field('name'), 'Benno'))
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(
      expect.objectContaining({ geschlecht: 'ruede', rasse: 'Hovawart', geburtsdatum: '2024-03-01', beiUnsSeit: '2024-05-01', beschreibung: 'Frech und lieb' })
    )
  })

  test('Eltern aus den eigenen Tieren derselben Art; ein Wechsel der Art leert die Wahl', async () => {
    const allDogs = [
      { id: 7, name: 'Wilma', geschlecht: 'huendin', tierart: 'hund', canEdit: true },
      { id: 8, name: 'Minka', geschlecht: 'huendin', tierart: 'katze', canEdit: true }
    ]
    api.createDog.mockResolvedValue({ id: 5, name: 'Lotte' })
    await render({ allDogs })
    choose('Hund')
    openMore()
    const mother = container.querySelector('.tier-mehr select')
    expect([...mother.options].map((o) => o.textContent)).toContain('Wilma')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(mother, '7')
    act(() => mother.dispatchEvent(new Event('change', { bubbles: true })))
    choose('Katze')
    choose('Hund')
    act(() => setValue(field('name'), 'Lotte'))
    await submit()
    expect(api.createDog.mock.calls[0][0].motherDogId).toBeNull()
  })

  test('mit livesWith: „lebt mit“ steht fest, kein Auswahlfeld; Tierheim startet „in Vermittlung“', async () => {
    api.createDog.mockResolvedValue({ id: 9, name: 'Hoppel' })
    await render({ livesWith: { id: 5, name: 'Nele' }, shelter: true, allDogs: [{ id: 5, name: 'Nele', canEdit: true }] })
    expect(container.querySelector('.quick-animal-fixed-housemate').textContent).toBe('lebt mit Nele')
    openMore()
    expect(field('housemateId')).toBeNull()
    choose('Hund')
    act(() => setValue(field('name'), 'Hoppel'))
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(expect.objectContaining({ housemateId: 5, vermittlungStatus: 'in_vermittlung' }))
  })

  test('ohne Tierheim kein vermittlungStatus; ein Fehler vom Server steht oben', async () => {
    api.createDog.mockRejectedValue(new Error('Name ist erforderlich'))
    await render()
    choose('Katze')
    act(() => setValue(field('name'), 'Minka'))
    await submit()
    expect(api.createDog).toHaveBeenCalledWith(expect.not.objectContaining({ vermittlungStatus: expect.anything() }))
    expect(container.querySelector('.error-banner').textContent).toBe('Name ist erforderlich')
    expect(document.activeElement).toBe(container.querySelector('.error-banner'))
  })

  test('Demo: kein Foto-Upload', async () => {
    await render({}, { isDemo: true })
    expect(container.querySelector('.portrait-feld input[type="file"]')).toBeNull()
    expect(container.textContent).toContain('In der Demo ohne Foto')
  })
})
