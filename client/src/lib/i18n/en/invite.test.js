// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import invite from './invite.js'
import { setLang } from '../index.js'
import { buildTimeline } from '../../timeline.js'
import { zeitraeumeClientError, zeitraeumeErrorRow, zeitraeumeText } from '../../zeitraeume.js'
import { broughtText } from '../../../components/invite/VoucherArchive.jsx'
import VisitChip from '../../../components/visits/VisitChip.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Englisch: Einladen, Besuche, Termine & Helfer', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(invite)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Chronik-Meilensteine, Termine und Codes auf Englisch', () => {
    const dog = { id: 1, name: 'Aiko', geburtsdatum: '2020-01-01', bei_uns_seit: '2020-03-01' }
    withEnglish(() => {
      expect(buildTimeline({ dog }).map((item) => item.titel)).toEqual(['Aiko is born', 'Aiko moves in'])
      expect(zeitraeumeText([{ von: '2026-11-01', bis: null }], '2026-10-10')).toBe('Date: 1.11.')
      const rows = [{ von: '2026-11-05', bis: '2026-11-01' }]
      const message = zeitraeumeClientError(rows)
      expect(message).toBe('Date 1: the end must not be before the start')
      expect(zeitraeumeErrorRow(rows, message)).toBe(0)
      expect(broughtText(3, 'Familie auf Pfoten', true)).toBe('You have already brought 3 people to Familie auf Pfoten.')
    })
    expect(buildTimeline({ dog })[0].titel).toBe('Aiko kommt zur Welt')
  })

  test('der Besuchs-Chip spricht Englisch', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    setLang('en')
    try {
      await act(async () => root.render(createElement(MemoryRouter, null, createElement(VisitChip, { name: 'Haus Möwe' }))))
      const chip = container.querySelector('a.visit-chip')
      expect(chip.textContent).toBe('Visiting · Back to My home')
      expect(chip.getAttribute('aria-label')).toBe('Visiting Haus Möwe – back to My home')
    } finally {
      setLang('de')
      act(() => root.unmount())
      container.remove()
    }
  })
})
