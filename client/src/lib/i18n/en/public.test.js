// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test } from 'vitest'
import publicPages from './public.js'
import { setLang } from '../index.js'
import { formatEuroCents, kennzeichnungLabel } from '../../discover.js'
import { saldoText, ruecklageText } from '../../finanzierungRuecklage.js'
import { tabCountText } from '../../portalTabs.js'
import FinanzierungRegel from '../../../components/finanzierung/FinanzierungRegel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

// Intl setzt ein geschütztes Leerzeichen zwischen Betrag und € - für lesbare Vergleiche normalisiert.
const plain = (text) => text.replace(/ /g, ' ')

describe('Englisch: Entdecken & öffentliche Seiten', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(publicPages)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Beträge, Kennzeichnung und Zähler auf Englisch', () => {
    withEnglish(() => {
      expect(formatEuroCents(125050)).toBe('€1,250.50')
      expect(plain(saldoText(-2300))).toBe('At the moment we cover €23.00 ourselves.')
      expect(ruecklageText({ jahreGedeckt: 1 })).toBe('Reserve: covers 1 year')
      expect(kennzeichnungLabel({ kennzeichnung: 'Anzeige' })).toBe('Advert')
      expect(kennzeichnungLabel({ kennzeichnung: 'Empfehlung', empfohlenVon: 'Anna' })).toBe('Recommended by Anna')
      expect(tabCountText(2, 'angebote')).toBe('2 offers')
      expect(tabCountText(1, 'termine')).toBe('1 date')
    })
    expect(plain(formatEuroCents(125050))).toBe('1.250,50 €')
    expect(tabCountText(2, 'angebote')).toBe('2 Angebote')
  })

  test('Spendenregel auf /finanzierung auf Englisch', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    setLang('en')
    try {
      await act(async () => root.render(createElement(FinanzierungRegel)))
      expect(container.querySelector('.finanz-regel-hand').textContent).toBe('Reserve for the server’s future')
      expect(container.textContent).toContain('all donated')
      expect(container.querySelector('ol').getAttribute('aria-label')).toBe('Share for the reserve')
    } finally {
      setLang('de')
      act(() => root.unmount())
      container.remove()
    }
  })
})
