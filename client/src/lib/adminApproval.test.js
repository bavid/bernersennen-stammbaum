import { describe, expect, test } from 'vitest'
import {
  ABLEHNUNG_VORLAGEN,
  GRUND_MESSAGE,
  MAX_SAMMEL_FREIGABE,
  SONSTIGES,
  SONSTIGES_MESSAGE,
  VORLAGE_MESSAGE,
  bulkStatus,
  composeGrund,
  grundError,
  maxZusatzLength,
  rejectionError
} from './adminApproval.js'

describe('Ablehnungsgründe als Vorlagen – wie server/lib/promotionFreigabe.js', () => {
  test('dieselbe feste Liste, "Sonstiges" zuletzt', () => {
    expect(ABLEHNUNG_VORLAGEN).toEqual([
      'Gesundheitsversprechen',
      'Kennzeichnung unklar',
      'Bild passt nicht / Rechte unklar',
      'Link führt ins Leere',
      'Kein Bezug zu Tieren',
      'Sonstiges'
    ])
    expect(SONSTIGES).toBe('Sonstiges')
    expect(Object.isFrozen(ABLEHNUNG_VORLAGEN)).toBe(true)
    expect(MAX_SAMMEL_FREIGABE).toBe(50)
  })

  test('composeGrund: Vorlage allein, Vorlage – Zusatz, bei "Sonstiges" nur der Zusatz', () => {
    expect(composeGrund('Kennzeichnung unklar', '')).toBe('Kennzeichnung unklar')
    expect(composeGrund('Kennzeichnung unklar', '   ')).toBe('Kennzeichnung unklar')
    expect(composeGrund('Link führt ins Leere', '  Die Kursseite fehlt. ')).toBe('Link führt ins Leere – Die Kursseite fehlt.')
    expect(composeGrund('Sonstiges', ' Bitte den Zeitraum ergänzen. ')).toBe('Bitte den Zeitraum ergänzen.')
  })

  test('rejectionError: keine Vorlage, "Sonstiges" ohne Text und zu lange Gründe', () => {
    expect(rejectionError('', '')).toEqual({ field: 'vorlage', message: VORLAGE_MESSAGE })
    expect(rejectionError('Gibt es nicht', 'x')).toEqual({ field: 'vorlage', message: VORLAGE_MESSAGE })
    expect(rejectionError('Sonstiges', '  ')).toEqual({ field: 'text', message: SONSTIGES_MESSAGE })
    expect(rejectionError('Sonstiges', 'ok')).toEqual({ field: 'text', message: GRUND_MESSAGE })
    expect(rejectionError('Kein Bezug zu Tieren', 'x'.repeat(300))).toEqual({ field: 'text', message: GRUND_MESSAGE })
    expect(rejectionError('Kein Bezug zu Tieren', '')).toBeNull()
    expect(rejectionError('Sonstiges', 'Bitte den Zeitraum ergänzen.')).toBeNull()
  })

  test('maxZusatzLength: Platz für den Zusatz neben der Vorlage, bis 300 Zeichen insgesamt', () => {
    expect(maxZusatzLength('Sonstiges')).toBe(300)
    expect(maxZusatzLength('')).toBe(300)
    expect(maxZusatzLength('Kennzeichnung unklar')).toBe(300 - 'Kennzeichnung unklar'.length - 3)
    expect(composeGrund('Kennzeichnung unklar', 'x'.repeat(maxZusatzLength('Kennzeichnung unklar')))).toHaveLength(300)
  })

  test('grundError bleibt: 3 bis 300 Zeichen', () => {
    expect(grundError('ok')).toBe(GRUND_MESSAGE)
    expect(grundError('Passt')).toBeNull()
  })
})

describe('bulkStatus – Ergebnis der Sammel-Freigabe', () => {
  test('Einzahl, Mehrzahl und übersprungene', () => {
    expect(bulkStatus({ freigegeben: 1, uebersprungen: 0 })).toBe('1 Beitrag freigegeben.')
    expect(bulkStatus({ freigegeben: 3, uebersprungen: 0 })).toBe('3 Beiträge freigegeben.')
    expect(bulkStatus({ freigegeben: 2, uebersprungen: 1 })).toBe('2 Beiträge freigegeben, 1 übersprungen (nicht mehr eingereicht).')
    expect(bulkStatus({ freigegeben: 0, uebersprungen: 2 })).toBe('0 Beiträge freigegeben, 2 übersprungen (nicht mehr eingereicht).')
  })
})
