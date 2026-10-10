// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test } from 'vitest'
import collage from './collage.js'
import { setLang } from '../index.js'
import { altText, formatClock, heuteVorText } from '../../bilderrahmen.js'
import { contactClientErrors } from '../../contactPartner.js'
import FrameControls from '../../../components/bilderrahmen/FrameControls.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Englisch: Collage, Bilderrahmen, Einstellungen & Kontakt', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(collage)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Bilderrahmen: Uhr, „Heute vor … Jahren“ und Alternativtext auf Englisch', () => {
    const saturday = new Date(2026, 9, 10, 9, 5)
    withEnglish(() => {
      expect(formatClock(saturday).date).toBe('Saturday, 10 October')
      expect(heuteVorText(3)).toBe('3 years ago today')
      expect(altText({ tierName: 'Nele', datum: '2025-03-01' })).toBe('Photo of Nele, 1 March 2025')
    })
    expect(formatClock(saturday).date).toBe('Samstag, 10. Oktober')
  })

  test('Kontaktformular: Meldungen am Feld auf Englisch', () => {
    const errors = withEnglish(() => contactClientErrors({ name: '', email: '', telefon: '', nachricht: 'kurz' }))
    expect(errors.email).toBe('Please give an email address or phone number so you can get a reply.')
    expect(errors.nachricht).toBe('The message must be 10 to 2000 characters long.')
  })

  test('Steuerung des Bilderrahmens: „Resume“ statt „Next“ nach der Pause', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    setLang('en')
    try {
      const props = { visible: true, paused: true, fullscreen: { supported: false }, canStep: true, onSettings: () => {} }
      await act(async () => root.render(createElement(FrameControls, props)))
      const labels = [...container.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(expect.arrayContaining(['Back', 'Resume', 'Next', 'Settings']))
      expect(container.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Photo frame controls')
    } finally {
      setLang('de')
      act(() => root.unmount())
      container.remove()
    }
  })
})
