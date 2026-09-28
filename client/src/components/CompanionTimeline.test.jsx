// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import CompanionTimeline from './CompanionTimeline.jsx'
import { companionRows, yearSpan } from '../lib/companions.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
})

const dog = (id, name, extra = {}) => ({
  id,
  name,
  tierart: 'hund',
  geschlecht: 'ruede',
  foto_url: null,
  bei_uns_seit: null,
  bei_uns_bis: null,
  abschied_grund: null,
  herkunft_art: null,
  herkunft_text: null,
  geburtsdatum: null,
  ...extra
})

async function render(rows, span, today) {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <CompanionTimeline rows={rows} span={span} today={today} />
      </MemoryRouter>
    )
  )
  return container
}

const today = '2026-09-28'
const dogs = [
  dog(1, 'Nele', { bei_uns_seit: '2016-09-20', herkunft_art: 'tierheim', herkunft_text: 'Tierheim Sonnenhang' }),
  dog(2, 'Aiko', { bei_uns_seit: '2010-01-01', bei_uns_bis: '2018-06-01', abschied_grund: 'verstorben' }),
  dog(3, 'Bello', { bei_uns_seit: '2020-03-01', bei_uns_bis: '2022-01-01', abschied_grund: 'umgezogen' })
]
const rows = companionRows(dogs, today)
const span = yearSpan(rows, today)

test('renders one row per animal in the given (chronological) order', async () => {
  await render(rows, span, today)
  const names = [...container.querySelectorAll('.companion-name')].map((el) => el.textContent)
  expect(names).toEqual(['Aiko', 'Nele', 'Bello'])
})

test('each row links to the animal page', async () => {
  await render(rows, span, today)
  const hrefs = [...container.querySelectorAll('.companion-link')].map((el) => el.getAttribute('href'))
  expect(hrefs).toEqual(['/tier/2', '/tier/1', '/tier/3'])
})

test('a deceased animal shows the "In Erinnerung" label with its years', async () => {
  await render(rows, span, today)
  const memory = container.querySelector('.companion-bar-label-memory')
  expect(memory.textContent).toBe('In Erinnerung · 2010–2018')
})

test('an animal still living with us shows a "heute" label and no memory label', async () => {
  await render(rows, span, today)
  const neleRow = [...container.querySelectorAll('.companion-row')].find((li) => li.textContent.includes('Nele'))
  expect(neleRow.querySelector('.companion-bar-label-today').textContent).toBe('heute')
  expect(neleRow.querySelector('.companion-bar-label-memory')).toBeNull()
  expect(neleRow.querySelector('.companion-bar').className).toContain('is-ongoing')
})

test('a rehomed animal gets the dashed bar style without a memory label', async () => {
  await render(rows, span, today)
  const belloRow = [...container.querySelectorAll('.companion-row')].find((li) => li.textContent.includes('Bello'))
  expect(belloRow.querySelector('.companion-bar').className).toContain('is-departed-other')
  expect(belloRow.querySelector('.companion-bar-label-memory')).toBeNull()
})

test('the accessible label describes since-when and the origin', async () => {
  await render(rows, span, today)
  const neleLink = [...container.querySelectorAll('.companion-link')].find((a) => a.textContent.includes('Nele'))
  expect(neleLink.getAttribute('aria-label')).toBe('Nele, bei euch seit 20. September 2016, aus dem Tierheim – Tierheim Sonnenhang')
})

test('an origin chip only appears when herkunft_art is set', async () => {
  await render(rows, span, today)
  const belloRow = [...container.querySelectorAll('.companion-row')].find((li) => li.textContent.includes('Bello'))
  expect(belloRow.querySelector('.companion-chip')).toBeNull()
  const neleRow = [...container.querySelectorAll('.companion-row')].find((li) => li.textContent.includes('Nele'))
  expect(neleRow.querySelector('.companion-chip').textContent).toBe('Tierheim')
})

test('a female cat shows the species only once instead of "Katze · Katze"', async () => {
  const catDogs = [dog(9, 'Mira', { tierart: 'katze', geschlecht: 'huendin', bei_uns_seit: '2012-08-01' })]
  const catRows = companionRows(catDogs, today)
  const catSpan = yearSpan(catRows, today)
  await render(catRows, catSpan, today)
  const row = container.querySelector('.companion-row')
  expect(row.querySelector('.companion-species').textContent).toBe('Katze')
})

test('a male cat still shows "Katze · Kater"', async () => {
  const catDogs = [dog(9, 'Balu', { tierart: 'katze', geschlecht: 'ruede', bei_uns_seit: '2012-08-01' })]
  const catRows = companionRows(catDogs, today)
  const catSpan = yearSpan(catRows, today)
  await render(catRows, catSpan, today)
  const row = container.querySelector('.companion-row')
  expect(row.querySelector('.companion-species').textContent).toBe('Katze · Kater')
})

test('a dog keeps showing "Hund · Hündin"', async () => {
  const dogRows = companionRows([dog(1, 'Nele', { tierart: 'hund', geschlecht: 'huendin', bei_uns_seit: '2021-06-12' })], today)
  const dogSpan = yearSpan(dogRows, today)
  await render(dogRows, dogSpan, today)
  const row = container.querySelector('.companion-row')
  expect(row.querySelector('.companion-species').textContent).toBe('Hund · Hündin')
})
