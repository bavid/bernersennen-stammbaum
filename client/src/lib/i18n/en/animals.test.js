// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test } from 'vitest'
import animals from './animals.js'
import { setLang } from '../index.js'
import { companionLine, herkunftText } from '../../companions.js'
import { dogTabs, originLine } from '../../dogProfile.js'
import ParentPicker from '../../../components/ParentPicker.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Englisch: Tiere', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(animals)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Herkunft, gemeinsame Zeit, Reiter und Herkunftszeile auf Englisch', () => {
    const dog = { bei_uns_seit: '2021-06-12', herkunft_art: 'tierheim', herkunft_text: 'Tierheim Sonnenhang' }
    withEnglish(() => {
      expect(herkunftText({ herkunft_art: 'zuechter', herkunft_text: '' })).toBe('from a breeder')
      expect(companionLine(dog).text).toBe('With you since 12 June 2021 · from Tierheim Sonnenhang')
      expect(dogTabs().map((tab) => tab.label)).toEqual(['Chronicle', 'Info', 'Relatives'])
      expect(originLine({ familyName: 'Zuhause Möwenweg', ownerFamilyId: 9 }, { id: 1, art: 'rudel', name: 'Familie A' })).toBe(
        'lives with Zuhause Möwenweg · shared with you via Familie A'
      )
    })
    expect(dogTabs()[0].label).toBe('Chronik')
  })

  test('Elternwahl rendert auf Englisch', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    withEnglish(() => {
      act(() => {
        root.render(createElement(ParentPicker, { label: 'Mother', sex: 'huendin', dogs: [], value: { dogId: '', freitext: '' }, onChange: () => {} }))
      })
      expect(container.textContent).toContain('From list')
      expect(container.textContent).toContain('– unknown –')
      expect(container.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Specify Mother')
    })
    act(() => root.unmount())
  })
})
