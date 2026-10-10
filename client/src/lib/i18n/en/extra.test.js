import { describe, expect, test } from 'vitest'
import extra from './extra.js'
import { setLang } from '../index.js'
import { animalCountText } from '../../animalCounts.js'
import { originLabel, sharedInHint } from '../../tierZuhause.js'
import { speciesSexLabel } from '../../timeline.js'
import theme from '../../../themes/standard.js'

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Englisch: Nachzügler', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(extra)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Tierzählung, Herkunft und Art auf Englisch, Deutsch bleibt Standard', () => {
    withEnglish(() => {
      expect(animalCountText({ tiere: 21, eigeneTiere: 4 }, theme.words)).toBe('21 animals · 4 of them yours')
      expect(originLabel('Zuhause Möwenweg')).toBe('from Zuhause Möwenweg')
      expect(sharedInHint('Zuhause Möwenweg', { art: 'familie', name: 'Familie Sonnenhang' })).toBe('shared in Familie Sonnenhang')
      expect(speciesSexLabel('katze', 'ruede')).toBe('Cat · Tomcat')
      expect(theme.footer).toBe('Familie auf Pfoten · A pawsome family')
    })
    expect(originLabel('Zuhause Möwenweg')).toBe('aus Zuhause Möwenweg')
    expect(theme.footer).toBe('Familie auf Pfoten · Eine tierisch nette Familie')
  })
})
