// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { log } = vi.hoisted(() => ({ log: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { log } } }))

import AdminLog, { describeAktion, describeZiel } from './AdminLog.jsx'

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
  log.mockReset()
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(ui))
  return container
}

const families = [
  { id: 3, name: 'Zuhause Birkenweg' },
  { id: 5, name: 'Tierheim Sonnenhang' }
]

describe('AdminLog – Protokoll der Admin-Ansicht', () => {
  test('describeZiel: Bereichsname aus der Übersicht, sonst die Nummer, Unbekanntes unverändert', () => {
    expect(describeZiel('family:5', families)).toBe('Tierheim Sonnenhang (#5)')
    expect(describeZiel('family:9', families)).toBe('Bereich #9')
    expect(describeZiel('family:9')).toBe('Bereich #9')
    expect(describeZiel('sonstiges', families)).toBe('sonstiges')
    expect(describeZiel(null)).toBe('')
    // V-Fehler 3: Schalter "Vertrauenswürdig" eines Partners
    expect(describeZiel('partner:4', families)).toBe('Partner #4')
    // Phase N Task 5: globale Hinweise
    expect(describeZiel('hinweis:12', families)).toBe('Hinweis #12')
  })

  test('describeAktion: view und der Schalter "Vertrauenswürdig" lesbar, Unbekanntes unverändert', () => {
    expect(describeAktion('view')).toBe('Bereich angesehen')
    expect(describeAktion('partner-vertrauenswuerdig')).toBe('Partner vertrauenswürdig gesetzt')
    expect(describeAktion('partner-nicht-vertrauenswuerdig')).toBe('Partner nicht mehr vertrauenswürdig')
    expect(describeAktion('hinweis-ausgeschaltet')).toBe('Hinweis ausgeschaltet')
    expect(describeAktion('hinweis-geloescht')).toBe('Hinweis gelöscht')
    expect(describeAktion('x')).toBe('x')
  })

  test('zeigt die Einträge mit Aktion, Bereich und Zeitpunkt in der Reihenfolge des Servers', async () => {
    log.mockResolvedValue([
      { id: 2, aktion: 'view', ziel: 'family:5', created_at: '2026-09-29 10:00:00' },
      { id: 1, aktion: 'view', ziel: 'family:8', created_at: '2026-09-28 09:00:00' }
    ])
    await render(<AdminLog families={families} />)

    expect(log).toHaveBeenCalledTimes(1)
    expect(container.querySelector('h2').textContent).toBe('Protokoll der Admin-Ansicht')
    const rows = [...container.querySelectorAll('.admin-log-entry')]
    expect(rows.map((row) => row.querySelector('.admin-log-ziel').textContent)).toEqual(['Tierheim Sonnenhang (#5)', 'Bereich #8'])
    expect(rows[0].querySelector('.admin-log-aktion').textContent).toBe('Bereich angesehen')
    const time = rows[0].querySelector('time')
    expect(time.getAttribute('dateTime')).toBe('2026-09-29T10:00:00Z')
    expect(time.textContent).not.toBe('')
  })

  test('ohne Einträge ein Hinweis, bei Fehlern die Meldung', async () => {
    log.mockResolvedValue([])
    await render(<AdminLog />)
    expect(container.textContent).toContain('Noch kein Bereich in der Admin-Ansicht geöffnet.')

    log.mockRejectedValue(new Error('Nur für Admins'))
    await act(async () => root.render(<AdminLog key="again" />))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Nur für Admins')
  })
})
