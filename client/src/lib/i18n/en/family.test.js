// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test } from 'vitest'
import family from './family.js'
import { setLang } from '../index.js'
import { SERIE, formatTagLang, formatUhrzeit, groupByMonth, serieLabel } from '../../termine.js'
import { tagLabel } from '../../erlebtMit.js'
import { visibilityOptions } from '../../entryForm.js'
import Lightbox from '../../../components/Lightbox.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Englisch: Familien & Erinnerungen', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(family)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Termine: Serien, Wochentage und Monate auf Englisch', () => {
    withEnglish(() => {
      expect(serieLabel(SERIE.monatlichWochentag, '2026-10-10')).toBe('Every 2nd Saturday of the month')
      expect(serieLabel(SERIE.monatlichTag, '2026-10-22')).toBe('Every month on the 22nd')
      expect(formatTagLang('2026-10-10')).toBe('Saturday, 10 October')
      expect(formatUhrzeit('10:00', '11:00')).toBe('10:00–11:00')
      expect(groupByMonth([{ datum: '2026-03-01' }])[0].label).toBe('March 2026')
    })
    expect(serieLabel(SERIE.woechentlich, '2026-10-10')).toBe('Jeden Samstag')
  })

  test('Mit dabei und Sichtbarkeit auf Englisch', () => {
    withEnglish(() => {
      expect(tagLabel({ name: 'Wilma', status: 'offen' })).toBe('along: Wilma (requested)')
      const [own, shared] = visibilityOptions(['Familie A', 'Familie B'])
      expect(own.label).toBe('Just us (private)')
      expect(shared.label).toBe('Share with Familie A and Familie B')
    })
  })

  test('Lightbox: Schließen-Knopf auf Englisch', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    setLang('en')
    try {
      await act(async () => root.render(createElement(Lightbox, { src: '/uploads/x.jpg', onClose: () => {} })))
      expect(container.querySelector('.icon-btn').getAttribute('aria-label')).toBe('Close')
    } finally {
      setLang('de')
      act(() => root.unmount())
      container.remove()
    }
  })
})
