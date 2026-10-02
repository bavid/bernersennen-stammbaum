import { describe, expect, test } from 'vitest'
import { VERLAUF_LABELS, describeVerlauf, latestVerlauf } from './freigabeVerlauf.js'

const event = (id, aktion, extra = {}) => ({ id, aktion, grund: null, createdAt: `2026-09-2${id} 10:00:00`, ...extra })

describe('describeVerlauf – Verlauf je Beitrag (server/lib/promotionFreigabe.js VERLAUF_AKTION)', () => {
  test('Beschriftungen für alle Aktionen', () => {
    expect(VERLAUF_LABELS).toEqual({
      eingereicht: 'Eingereicht',
      geaendert: 'Geändert',
      freigegeben: 'Freigegeben',
      abgelehnt: 'Abgelehnt',
      zurueckgezogen: 'Zurückgezogen'
    })
  })

  test('erneutes Einreichen, Änderung während der Prüfung und eine Änderung, die online blieb', () => {
    const entries = describeVerlauf([
      event(1, 'eingereicht'),
      event(2, 'geaendert'),
      event(3, 'freigegeben'),
      event(4, 'geaendert'),
      event(5, 'eingereicht'),
      event(6, 'abgelehnt', { grund: 'Kennzeichnung unklar' })
    ])
    expect(entries.map((entry) => entry.label)).toEqual([
      'Eingereicht',
      'Geändert',
      'Freigegeben',
      'Geändert – blieb online',
      'Erneut eingereicht',
      'Abgelehnt'
    ])
    expect(entries.map((entry) => entry.tone)).toEqual(['neutral', 'neutral', 'ok', 'ok', 'neutral', 'danger'])
    expect(entries[5]).toMatchObject({ id: 6, grund: 'Kennzeichnung unklar', createdAt: '2026-09-26 10:00:00' })
  })

  test('unbekannte Aktionen und fehlender Verlauf', () => {
    expect(describeVerlauf([event(1, 'irgendwas')])[0]).toMatchObject({ label: 'irgendwas', tone: 'neutral' })
    expect(describeVerlauf(undefined)).toEqual([])
    expect(describeVerlauf(null)).toEqual([])
  })

  test('latestVerlauf: der jüngste Eintrag mit Beschriftung, sonst null', () => {
    expect(latestVerlauf([event(1, 'eingereicht'), event(2, 'eingereicht')])).toMatchObject({ id: 2, label: 'Erneut eingereicht' })
    expect(latestVerlauf([])).toBeNull()
    expect(latestVerlauf(undefined)).toBeNull()
  })
})
