// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { stats } = vi.hoisted(() => ({ stats: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { stats } } }))

import AdminStats from './AdminStats.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// 30 Tage bis zum 29.09.2026 (wie server/lib/adminStats.js: aufsteigend, heute zuletzt, Tage ohne Klicks 0).
function tage(values) {
  const start = Date.UTC(2026, 7, 31)
  return values.map((anzahl, index) => ({ tag: new Date(start + index * 86_400_000).toISOString().slice(0, 10), anzahl }))
}

// Antwort von GET /api/admin/stats: letzte 7 Tage 1..7 (Summe 28), dazu ein Ausreißer 9 am 10.09. (gesamt 37).
function fixture(overrides = {}) {
  const klickTage = tage([...Array(23).fill(0), 1, 2, 3, 4, 5, 6, 7])
  klickTage[10] = { ...klickTage[10], anzahl: 9 }
  return {
    einloesungen: {
      stapel: [
        { id: 1, label: 'Frühjahrsaktion', zweck: 'chronik', size: 12, eingeloest: 6, offen: 3, widerrufen: 1 },
        { id: 2, label: 'Zugänge Herbst', zweck: 'partnerzugang', size: 4, eingeloest: 0, offen: 0, widerrufen: 0 }
      ],
      partner: [
        { partnerId: 4, name: 'Hundeschule Pfotenglück', neueBereiche: 5 },
        { partnerId: 7, name: 'Tierheim Wiesengrund', neueBereiche: 2 },
        { partnerId: 9, name: 'Hundesalon Fellglanz', neueBereiche: 0 }
      ],
      zweck: [
        { zweck: 'chronik', gesamt: 1260, eingeloest: 1234, offen: 20, widerrufen: 3 },
        { zweck: 'partnerzugang', gesamt: 5, eingeloest: 2, offen: 3, widerrufen: 0 }
      ]
    },
    mundpropaganda: {
      ketten: 3,
      maxTiefe: 2,
      top: [
        { startFamilyId: 11, name: 'Rudel Sonnenhang', nachkommen: 4 },
        { startFamilyId: 12, name: 'Zuhause Birkenweg', nachkommen: 1 }
      ]
    },
    klicks: {
      tage: klickTage,
      top: [
        { targetType: 'promotion', targetId: 3, titel: 'Tag der offenen Tür', klicks7: 12, klicks30: 30, gesamt: 1500 },
        { targetType: 'partner-website', targetId: 4, titel: 'Hundeschule Pfotenglück – Website', klicks7: 2, klicks30: 7, gesamt: 9 }
      ]
    },
    partner: {
      status: { entwurf: 1, aktiv: 3, pausiert: 2, gesperrt: 1 },
      einblicke: 12,
      beitraege: { eingereicht: 2, freigegeben: 5, abgelehnt: 1 },
      ungeleseneNachrichten: 4
    },
    ...overrides
  }
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
  stats.mockReset()
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(ui))
  return container
}

const texts = (selector, scope = container) => [...scope.querySelectorAll(selector)].map((el) => el.textContent.trim())
const tiles = () => [...container.querySelectorAll('.admin-stats-kennzahlen > div')].map((tile) => [tile.querySelector('dt').textContent, tile.querySelector('dd').textContent])

describe('AdminStats – Kennzahlen', () => {
  test('lädt die Statistik und rechnet die vier Kacheln aus der Antwort (Zahlen de-DE)', async () => {
    stats.mockResolvedValue(fixture())
    await render(<AdminStats bereiche={8} />)

    expect(stats).toHaveBeenCalledTimes(1)
    expect(container.querySelector('h2').textContent).toBe('Kennzahlen')
    expect(tiles()).toEqual([
      ['Bereiche', '8'],
      ['Partner aktiv', '3'],
      ['Eingelöste Einladungscodes', '1.236'],
      ['Klicks 7 Tage', '28']
    ])
  })

  test('ohne Bereiche-Wert entfällt die erste Kachel', async () => {
    stats.mockResolvedValue(fixture())
    await render(<AdminStats />)

    expect(tiles().map(([label]) => label)).toEqual(['Partner aktiv', 'Eingelöste Einladungscodes', 'Klicks 7 Tage'])
  })

  test('zeigt „Lade …“, bis die Antwort da ist', async () => {
    let resolve
    stats.mockReturnValue(new Promise((r) => (resolve = r)))
    await render(<AdminStats bereiche={8} />)

    expect(container.textContent).toContain('Lade …')
    expect(container.querySelector('.admin-stats-kennzahlen')).toBeNull()

    await act(async () => resolve(fixture()))
    expect(container.textContent).not.toContain('Lade …')
    expect(tiles()).toHaveLength(4)
  })

  test('ein Fehler erscheint als Meldung statt der Zahlen', async () => {
    stats.mockRejectedValue(new Error('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.'))
    await render(<AdminStats bereiche={8} />)

    expect(container.querySelector('[role="alert"]').textContent).toBe('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.')
    expect(container.textContent).not.toContain('Lade …')
    expect(container.querySelector('.admin-stats-kennzahlen')).toBeNull()
  })
})

describe('AdminStats – Gutschein-Stapel und Partner-Ranking', () => {
  test('je Stapel Zweck-Badge, Verteilungsbalken in Prozent und die drei Zahlen; leerer Stapel als leere Spur', async () => {
    stats.mockResolvedValue(fixture())
    await render(<AdminStats />)

    const [first, second] = container.querySelectorAll('.stat-stapel-row')
    expect(first.querySelector('th').textContent).toBe('Frühjahrsaktion · 12 Codes')
    expect(first.querySelector('.admin-voucher-zweck-badge').textContent).toBe('Einladungscodes')
    const segments = [...first.querySelectorAll('.stat-bar-segment')]
    expect(segments.map((s) => s.className)).toEqual(['stat-bar-segment is-eingeloest', 'stat-bar-segment is-offen', 'stat-bar-segment is-widerrufen'])
    expect(segments.map((s) => s.style.width)).toEqual(['60%', '30%', '10%'])
    expect(segments.map((s) => s.getAttribute('title'))).toEqual(['Eingelöst: 6', 'Offen: 3', 'Zurückgezogen: 1'])
    expect(texts('.stat-num', first)).toEqual(['6', '3', '1'])

    expect(second.querySelector('.admin-voucher-zweck-badge').textContent).toBe('Partner-Zugang')
    const leer = [...second.querySelectorAll('.stat-bar-segment')]
    expect(leer).toHaveLength(1)
    expect(leer[0].className).toBe('stat-bar-segment is-leer')
    expect(leer[0].style.width).toBe('100%')

    // Legende in den Spaltenköpfen: ein Farbpunkt je Segment, Balken selbst für Screenreader ausgeblendet.
    // Auf die Stapel-Tabelle begrenzt - die Klick-Tabelle nutzt dieselben Klassen mit anderen Spalten.
    const table = first.closest('table')
    expect(texts('thead .stat-num', table)).toEqual(['Eingelöst', 'Offen', 'Zurückgezogen'])
    expect(table.querySelectorAll('thead .stat-dot')).toHaveLength(3)
    expect(first.querySelector('.stat-bar').getAttribute('aria-hidden')).toBe('true')
  })

  test('ohne Stapel: „Noch keine Stapel“', async () => {
    const data = fixture()
    stats.mockResolvedValue({ ...data, einloesungen: { ...data.einloesungen, stapel: [] } })
    await render(<AdminStats />)

    expect(container.textContent).toContain('Noch keine Stapel')
    expect(container.querySelector('.stat-stapel-row')).toBeNull()
  })

  test('Partner-Ranking: nur Partner mit neuen Bereichen, Balken relativ zum Ersten', async () => {
    stats.mockResolvedValue(fixture())
    await render(<AdminStats />)

    const rows = [...container.querySelectorAll('.stat-ranking > li')]
    expect(rows).toHaveLength(2)
    expect(texts('.stat-ranking-name')).toEqual(['Hundeschule Pfotenglück', 'Tierheim Wiesengrund'])
    expect(rows.map((row) => row.querySelector('.stat-ranking-bar > span').style.width)).toEqual(['100%', '40%'])
    expect(texts('.stat-ranking-value')).toEqual(['5 Bereiche', '2 Bereiche'])
  })

  test('Partner-Ranking ohne neue Bereiche: „Noch keine Bereiche über Partner“', async () => {
    const data = fixture()
    stats.mockResolvedValue({
      ...data,
      einloesungen: { ...data.einloesungen, partner: [{ partnerId: 9, name: 'Hundesalon Fellglanz', neueBereiche: 0 }] }
    })
    await render(<AdminStats />)

    expect(container.textContent).toContain('Noch keine Bereiche über Partner')
    expect(container.querySelector('.stat-ranking')).toBeNull()
  })
})

describe('AdminStats – Mundpropaganda', () => {
  test('Kernsatz mit Ketten und Tiefe, darunter die Wurzeln mit Nachkommen', async () => {
    stats.mockResolvedValue(fixture())
    await render(<AdminStats />)

    expect(container.querySelector('.stat-lead').textContent).toBe('3 Ketten, tiefste 2 Stufen')
    expect(texts('.stat-chains > li')).toEqual(['Rudel Sonnenhang · 4 Nachkommen', 'Zuhause Birkenweg · 1 Nachkomme'])
  })

  test('ohne Weitergaben nur der Hinweis', async () => {
    stats.mockResolvedValue(fixture({ mundpropaganda: { ketten: 0, maxTiefe: 0, top: [] } }))
    await render(<AdminStats />)

    // Audit V7a: derselbe ruhige Leerzustand wie beim Partner-Ranking
    expect(container.querySelector('.stat-lead')).toBeNull()
    expect([...container.querySelectorAll('p.muted')].some((p) => p.textContent === 'Noch keine Weitergaben')).toBe(true)
    expect(container.querySelector('.stat-chains')).toBeNull()
  })
})

describe('AdminStats – Klicks', () => {
  test('Sparkline als Bild mit Summen im aria-label, verborgener Tagestabelle und Top-Liste', async () => {
    stats.mockResolvedValue(fixture())
    await render(<AdminStats />)

    const svg = container.querySelector('.stat-sparkline svg')
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Klicks der letzten 30 Tage: 37 insgesamt, 28 in den letzten 7 Tagen, Höchstwert 9 am 10.09.')

    const line = svg.querySelector('.stat-sparkline-line').getAttribute('d')
    expect(line.startsWith('M')).toBe(true)
    expect(line.split(' ')).toHaveLength(30)
    expect(svg.querySelector('.stat-sparkline-area')).not.toBeNull()
    expect(svg.querySelector('.stat-sparkline-dot')).not.toBeNull()
    expect(svg.querySelectorAll('.stat-sparkline-hit title')).toHaveLength(30)
    expect(svg.querySelectorAll('.stat-sparkline-hit title')[10].textContent).toBe('10.09. 9 Klicks')
    expect(texts('.stat-sparkline-axis span')).toEqual(['31.08.', '29.09.'])

    const table = container.querySelector('.stat-sparkline table.visually-hidden')
    expect(table.querySelector('caption').textContent).toBe('Klicks je Tag')
    const rows = [...table.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(30)
    expect(rows[10].querySelector('th').textContent).toBe('10.09.')
    expect(rows[10].querySelector('td').textContent).toBe('9')
    expect(rows[29].querySelector('th').textContent).toBe('29.09.')
    expect(rows[29].querySelector('td').textContent).toBe('7')

    const top = [...container.querySelectorAll('.stat-klick-row')]
    expect(top).toHaveLength(2)
    expect(texts('th, td', top[0])).toEqual(['Tag der offenen Tür', '12', '30', '1.500'])
  })

  test('ohne Klicks: flache Linie auf der Grundlinie und „Noch keine Klicks“', async () => {
    stats.mockResolvedValue(fixture({ klicks: { tage: tage(Array(30).fill(0)), top: [] } }))
    await render(<AdminStats />)

    const svg = container.querySelector('.stat-sparkline svg')
    expect(svg.getAttribute('aria-label')).toBe('Klicks der letzten 30 Tage: 0 insgesamt, 0 in den letzten 7 Tagen.')
    const baseline = svg.querySelector('.stat-sparkline-baseline').getAttribute('y1')
    const ys = svg.querySelector('.stat-sparkline-line').getAttribute('d').split(' ').map((part) => part.split(',')[1])
    expect(new Set(ys)).toEqual(new Set([baseline]))
    expect(container.textContent).toContain('Noch keine Klicks')
    expect(container.querySelector('.stat-klick-row')).toBeNull()
  })
})

describe('AdminStats – Partner-Status', () => {
  test('vier Chips, Einblicke, Beiträge je Freigabe mit Sprung zur Freigabe-Karte, ungelesene Nachrichten', async () => {
    stats.mockResolvedValue(fixture())
    await render(<AdminStats />)

    expect(texts('.stat-chips > li')).toEqual(['1 Entwurf', '3 Aktiv', '2 Pausiert', '1 Gesperrt'])
    const facts = texts('.stat-facts > div')
    expect(facts[0]).toBe('Einblicke12')
    expect(facts[2]).toBe('Ungelesene Nachrichten4 Nachrichten')

    const link = container.querySelector('.stat-beitraege a')
    expect(link.getAttribute('href')).toBe('#admin-approval-title')
    expect(link.textContent).toBe('2 eingereicht')
    expect(link.className).toContain('freigabe-chip-eingereicht')
    expect(texts('.stat-beitraege > span')).toEqual(['5 freigegeben', '1 abgelehnt'])
  })

  test('ohne eingereichte Beiträge kein Link, nur die Zahl', async () => {
    const data = fixture()
    stats.mockResolvedValue({ ...data, partner: { ...data.partner, beitraege: { eingereicht: 0, freigegeben: 5, abgelehnt: 1 }, ungeleseneNachrichten: 1 } })
    await render(<AdminStats />)

    expect(container.querySelector('.stat-beitraege a')).toBeNull()
    expect(texts('.stat-beitraege > span')).toEqual(['0 eingereicht', '5 freigegeben', '1 abgelehnt'])
    expect(container.textContent).toContain('1 Nachricht')
  })
})
