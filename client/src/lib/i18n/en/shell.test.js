import { describe, expect, test } from 'vitest'
import shell from './shell.js'
import { setLang } from '../index.js'
import { navItemsFor } from '../../navItems.js'
import { bellLabel, startLineText } from '../../glocke.js'
import { yearsAgoLabel } from '../../seasons.js'

const UMLAUT = /[äöüÄÖÜß]/

function inEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('englische Texte: shell', () => {
  test('hat keine leeren oder vergessenen Übersetzungen', () => {
    for (const [key, value] of Object.entries(shell)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (UMLAUT.test(key)) expect(value, key).not.toBe(key)
    }
  })

  test('Navigation und Glocke sprechen Englisch', () => {
    const labels = inEnglish(() => navItemsFor({ art: 'partner', partner: { unread: 2 } }))
    expect(labels.map((item) => item.label)).toEqual(['Profile', 'Posts', 'Calendar', 'Messages', 'Access'])
    expect(labels[3].ariaLabel).toBe('Messages, 2 unread')
    expect(inEnglish(() => bellLabel(3))).toBe('Notices, 3 new')
    expect(inEnglish(() => startLineText(1))).toBe('1 new notice')
  })

  test('Jahrestag auf Start in Englisch, Deutsch bleibt Standard', () => {
    expect(inEnglish(() => yearsAgoLabel('2024-10-10', '2026-10-10'))).toBe('2 years ago today')
    expect(yearsAgoLabel('2025-10-10', '2026-10-10')).toBe('Heute vor einem Jahr')
  })
})
