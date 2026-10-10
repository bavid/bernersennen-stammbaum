// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import StartSoon, { soonItems } from './StartSoon.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

const termin = (id, termin_datum) => ({ id, text: `Termin ${id}`, termin_datum, termin_zeit: null, area: null })
const gesundheit = (entryId, naechstesAm) => ({ entryId, dogId: 4, dogName: 'Wilma', art: 'impfung', naechstesAm })

describe('„Bald“ auf Start: eine Liste nach Datum', () => {
  test('soonItems mischt Termine, Gesundheit und Jahrestag aufsteigend - am selben Tag stabil', () => {
    const items = soonItems({
      termine: [termin(1, '2026-10-20'), termin(2, '2026-10-12')],
      gesundheit: [gesundheit(9, '2026-10-11'), gesundheit(8, '2026-10-12')],
      anniversary: { daysUntil: 5, years: 2, dog: { name: 'Benno' } },
      heute: '2026-10-10'
    })
    expect(items.map((item) => item.key)).toEqual(['gesundheit-9', 'termin-2', 'gesundheit-8', 'jahrestag', 'termin-1'])
  })

  test('die Gesundheit steht vor einem späteren Pinnwand-Termin', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter>
          <StartSoon termine={[termin(1, '2026-10-20')]} gesundheit={[gesundheit(9, '2026-10-11')]} heute="2026-10-10" />
        </MemoryRouter>
      )
    )
    const texts = [...container.querySelectorAll('.start-soon-text')].map((el) => el.textContent)
    expect(texts[0]).toContain('Wilma')
    expect(texts[1]).toBe('Termin 1')
  })
})
