import { describe, expect, test } from 'vitest'
import {
  CARDS_PER_SHEET,
  DESIGN,
  cardDesign,
  chunkCards,
  hostLabel,
  isLocalAddress,
  needsPublicUrl,
  printAddressPending,
  ADDRESS_PENDING_TEXT,
  printBaseUrl,
  voucherUrl
} from './voucherPrint.js'

describe('printBaseUrl / voucherUrl', () => {
  test('nimmt die öffentliche Adresse ohne Schrägstrich am Ende, sonst den Ursprung der Seite', () => {
    expect(printBaseUrl('https://beispiel-chronik.de/', 'http://localhost:5173')).toBe('https://beispiel-chronik.de')
    expect(printBaseUrl(null, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(printBaseUrl('', 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(printBaseUrl('  https://beispiel-chronik.de  ', 'x')).toBe('https://beispiel-chronik.de')
  })

  test('der Code steht hinter der Raute von /v - nie im Pfad oder in der Abfrage', () => {
    const url = voucherUrl('https://beispiel-chronik.de', 'ABCD-EFGH-JKLM')
    expect(url).toBe('https://beispiel-chronik.de/v#ABCD-EFGH-JKLM')
    expect(new URL(url).pathname).toBe('/v')
    expect(new URL(url).search).toBe('')
    expect(new URL(url).hash).toBe('#ABCD-EFGH-JKLM')
  })

  test('hostLabel zeigt nur Host (und Port), ohne Protokoll', () => {
    expect(hostLabel('https://beispiel-chronik.de')).toBe('beispiel-chronik.de')
    expect(hostLabel('http://localhost:5173')).toBe('localhost:5173')
    expect(hostLabel('beispiel-chronik.de')).toBe('beispiel-chronik.de')
  })
})

describe('isLocalAddress / needsPublicUrl', () => {
  test('erkennt localhost, IPv4- und IPv6-Adressen als nicht öffentlich', () => {
    expect(isLocalAddress('http://localhost:5173')).toBe(true)
    expect(isLocalAddress('http://app.localhost')).toBe(true)
    expect(isLocalAddress('http://127.0.0.1:4000')).toBe(true)
    expect(isLocalAddress('http://192.168.2.10')).toBe(true)
    expect(isLocalAddress('http://[::1]:4000')).toBe(true)
    expect(isLocalAddress('https://beispiel-chronik.de')).toBe(false)
    expect(isLocalAddress('https://chronik.beispiel-verein.org/')).toBe(false)
  })

  test('ohne Schema ist die Adresse kein gültiges Ziel', () => {
    expect(isLocalAddress('beispiel-chronik.de')).toBe(true)
  })

  test('needsPublicUrl warnt bei fehlender oder lokaler Adresse', () => {
    expect(needsPublicUrl(null)).toBe(true)
    expect(needsPublicUrl('')).toBe(true)
    expect(needsPublicUrl('http://10.0.0.5:4000')).toBe(true)
    expect(needsPublicUrl('https://beispiel-chronik.de')).toBe(false)
  })
})

describe('printAddressPending', () => {
  test('ohne öffentliche Domain - nie in Vorschau, Testsystem, Demo oder Admin-Ansicht', () => {
    expect(printAddressPending({ appEnv: 'production', publicUrl: null })).toBe(true)
    expect(printAddressPending({ appEnv: 'production', publicUrl: 'http://10.0.0.5:4000' })).toBe(true)
    expect(printAddressPending({ appEnv: 'production', publicUrl: 'https://beispiel-chronik.de' })).toBe(false)
    expect(printAddressPending({ appEnv: 'staging', publicUrl: null })).toBe(false)
    expect(printAddressPending({ appEnv: 'dev', publicUrl: 'http://localhost:5173' })).toBe(false)
    // Unbekannte Umgebung (Konfiguration nicht geladen): wie Produktion - der Druck wartet.
    expect(printAddressPending({ appEnv: undefined, publicUrl: null })).toBe(true)
    expect(printAddressPending({ appEnv: undefined, publicUrl: 'https://beispiel-chronik.de' })).toBe(false)
    expect(printAddressPending({ appEnv: 'production', publicUrl: null, readOnly: true })).toBe(false)
  })

  test('der Hinweis nennt keine Adresse', () => {
    expect(ADDRESS_PENDING_TEXT).toBe('Drucken ist bald möglich – wir richten gerade die Adresse der Plattform ein.')
  })
})

describe('cardDesign', () => {
  test('Kunden-Karte ohne Partner, Partner-Stapel mit Partner, Zugangs-Karte bei zweck partnerzugang', () => {
    expect(cardDesign({ zweck: 'chronik', partner: null })).toBe(DESIGN.customer)
    expect(cardDesign({ zweck: null, partner: null })).toBe(DESIGN.customer)
    expect(cardDesign({ zweck: 'chronik', partner: { name: 'Hundeschule Wiesengrund' } })).toBe(DESIGN.partner)
    expect(cardDesign({ zweck: 'partnerzugang', partner: null })).toBe(DESIGN.access)
    expect(cardDesign({ zweck: 'partnerzugang', partner: { name: 'Salon Fellglanz' } })).toBe(DESIGN.access)
  })
})

describe('chunkCards', () => {
  test('10 Karten je Bogen, der letzte Bogen darf teilweise gefüllt sein', () => {
    expect(CARDS_PER_SHEET).toBe(10)
    const codes = Array.from({ length: 23 }, (_, i) => `CODE-${i}`)
    const sheets = chunkCards(codes)
    expect(sheets).toHaveLength(3)
    expect(sheets[0]).toHaveLength(10)
    expect(sheets[1]).toHaveLength(10)
    expect(sheets[2]).toEqual(['CODE-20', 'CODE-21', 'CODE-22'])
  })

  test('genau volle Bögen ohne leeren Nachzügler; ohne Codes kein Bogen', () => {
    expect(chunkCards(Array.from({ length: 20 }, (_, i) => String(i)))).toHaveLength(2)
    expect(chunkCards([])).toEqual([])
  })

  test('verändert die Eingabe nicht', () => {
    const codes = ['A', 'B', 'C']
    chunkCards(codes, 2)
    expect(codes).toEqual(['A', 'B', 'C'])
  })
})
