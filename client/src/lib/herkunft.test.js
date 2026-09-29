import { describe, expect, test } from 'vitest'
import { parseHerkunft } from './herkunft.js'

describe('parseHerkunft – Herkunft eines Bereichs als Chip', () => {
  test('Partner, Weitergabe und Stapel bekommen Text und Variante', () => {
    expect(parseHerkunft('partner:Hundeschule Pfotenglück')).toEqual({ variant: 'partner', label: 'über Partner Hundeschule Pfotenglück' })
    expect(parseHerkunft('weitergabe:Rudel Sonnenhang')).toEqual({ variant: 'weitergabe', label: 'weitergegeben von Rudel Sonnenhang' })
    expect(parseHerkunft('stapel:Frühjahrsaktion')).toEqual({ variant: 'stapel', label: 'Stapel Frühjahrsaktion' })
  })

  test('Namen mit Doppelpunkt bleiben ganz', () => {
    expect(parseHerkunft('stapel:Aktion: Herbst 2026')).toEqual({ variant: 'stapel', label: 'Stapel Aktion: Herbst 2026' })
  })

  test('Altbestand ohne und mit Freitext quelle als Hinweis', () => {
    expect(parseHerkunft('altbestand')).toEqual({ variant: 'altbestand', label: 'Altbestand' })
    expect(parseHerkunft('altbestand', '  Flyer im Tierheim ')).toEqual({ variant: 'altbestand', label: 'Altbestand', hint: 'Flyer im Tierheim' })
    expect(parseHerkunft('altbestand', null)).toEqual({ variant: 'altbestand', label: 'Altbestand' })
  })

  test('ohne herkunft bleibt der Freitext quelle', () => {
    expect(parseHerkunft(undefined, 'Empfehlung einer Freundin')).toEqual({ variant: 'quelle', label: 'über: Empfehlung einer Freundin' })
    expect(parseHerkunft(null, 'Empfehlung')).toEqual({ variant: 'quelle', label: 'über: Empfehlung' })
  })

  test('unbekannte oder leere Formen fallen auf quelle zurück', () => {
    expect(parseHerkunft('sonstwas:Name', 'Flyer')).toEqual({ variant: 'quelle', label: 'über: Flyer' })
    expect(parseHerkunft('partner:', 'Flyer')).toEqual({ variant: 'quelle', label: 'über: Flyer' })
    expect(parseHerkunft('partner:   ')).toBeNull()
    expect(parseHerkunft(':Name')).toBeNull()
  })

  test('ohne beides nichts', () => {
    expect(parseHerkunft(undefined, undefined)).toBeNull()
    expect(parseHerkunft('', '   ')).toBeNull()
    expect(parseHerkunft(42, 7)).toBeNull()
  })
})
