// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test } from 'vitest'
import partner from './partner.js'
import { setLang } from '../index.js'
import { describeVerlauf } from '../../freigabeVerlauf.js'
import { postClientErrors, savedMessage } from '../../partnerPosts.js'
import { missingCodesText } from '../../../components/visitenkarte/KartenCodes.jsx'
import FreigabeChip from '../../../components/FreigabeChip.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Englisch: Partner-Bereich', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(partner)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Beiträge: Verlauf, Rückmeldung und Feldfehler auf Englisch', () => {
    withEnglish(() => {
      const verlauf = describeVerlauf([{ aktion: 'eingereicht' }, { aktion: 'abgelehnt' }, { aktion: 'eingereicht' }])
      expect(verlauf.map((entry) => entry.label)).toEqual(['Submitted', 'Declined', 'Resubmitted'])
      expect(savedMessage(null, { created: true })).toBe('Submitted – the post will be visible once approved.')
      expect(postClientErrors({ titel: '', text: '', bereich: '', start: '', ende: '' }, 'hundeschule').titel).toBe('The title is required')
    })
    expect(savedMessage({ freigabe: 'freigegeben' }, { created: false })).toBe('Gespeichert – die Änderung ist sofort online.')
  })

  test('Karten: fehlende Codes auf Englisch', () => {
    withEnglish(() => {
      expect(missingCodesText(2, 3)).toBe('Codes are missing for 2 cards – only the 3 with a code will be printed.')
    })
    expect(missingCodesText(1, 1)).toBe('Für 1 Karte fehlen Codes – gedruckt wird nur die eine mit Code.')
  })

  test('Freigabe-Chip auf Englisch', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    setLang('en')
    try {
      await act(async () => root.render(createElement(FreigabeChip, { freigabe: 'eingereicht' })))
      expect(container.textContent).toBe('Awaiting approval')
    } finally {
      setLang('de')
      act(() => root.unmount())
      container.remove()
    }
  })
})
