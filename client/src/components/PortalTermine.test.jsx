// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import PortalTermine from './PortalTermine.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
})

async function render(termine, today = '2026-10-03') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<PortalTermine termine={termine} today={today} />))
  return container
}

function termin(datum, overrides = {}) {
  return { terminId: 1, datum, uhrzeit: '10:00', ende: '11:00', titel: 'Welpenspielstunde', text: 'Für Welpen bis 16 Wochen.', ort: 'Trainingsplatz', serie: 'woechentlich', abgesagt: false, ...overrides }
}

describe('PortalTermine', () => {
  test('ohne Termine kein Abschnitt', async () => {
    await render([])
    expect(container.innerHTML).toBe('')
    await render(undefined)
    expect(container.innerHTML).toBe('')
  })

  test('nach Monat, abgesagte durchgestrichen mit "fällt aus", Text und Regel nur beim ersten Tag', async () => {
    await render([
      termin('2026-10-10'),
      termin('2026-10-17', { abgesagt: true }),
      termin('2026-11-14', { terminId: 2, titel: 'Social Walk', ort: null, serie: 'keine', text: null }),
      termin('2026-11-21')
    ])
    expect(container.querySelector('#partner-portal-termine-title').textContent).toBe('Termine')
    expect([...container.querySelectorAll('.termin-month-title')].map((h) => h.textContent)).toEqual(['Oktober 2026', 'November 2026'])
    const [first, cancelled, walk] = container.querySelectorAll('.termin-row')
    expect(first.querySelector('.termin-row-time').textContent).toBe('10:00–11:00 Uhr')
    expect(first.querySelector('.portal-termin-text').textContent).toBe('Für Welpen bis 16 Wochen.')
    expect(first.querySelector('.termin-row-meta').textContent).toBe('Trainingsplatz · Jeden Samstag')
    const later = container.querySelectorAll('.termin-row')[3]
    expect(later.querySelector('.portal-termin-text')).toBeNull()
    expect(later.querySelector('.termin-row-meta').textContent).toBe('Trainingsplatz')
    expect(cancelled.classList.contains('is-cancelled')).toBe(true)
    expect(cancelled.textContent).toContain('fällt aus')
    expect(cancelled.querySelector('.portal-termin-text')).toBeNull()
    expect(walk.querySelector('.termin-row-meta')).toBeNull()
  })

  test('zuerst drei Monate, "Mehr anzeigen" zeigt den Rest', async () => {
    await render([termin('2026-10-10'), termin('2027-01-03'), termin('2027-02-06'), termin('2027-05-01')])
    expect(container.querySelectorAll('.termin-row')).toHaveLength(2)
    const more = container.querySelector('.portal-termine-more')
    expect(more.textContent).toBe('Mehr anzeigen (2 weitere)')
    await act(async () => more.click())
    expect(container.querySelectorAll('.termin-row')).toHaveLength(4)
    expect(container.querySelector('.portal-termine-more')).toBeNull()
  })

  test('liegt alles später als drei Monate, steht es gleich da', async () => {
    await render([termin('2027-03-06')])
    expect(container.querySelectorAll('.termin-row')).toHaveLength(1)
    expect(container.querySelector('.portal-termine-more')).toBeNull()
  })
})
