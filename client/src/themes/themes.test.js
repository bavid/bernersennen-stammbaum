import { describe, expect, test } from 'vitest'
import { THEME_IDS, getTheme } from './index.js'

describe('themes', () => {
  test('standard and berner are available, unknown ids fall back to standard', () => {
    expect(THEME_IDS).toEqual(['standard', 'berner'])
    expect(getTheme('berner').id).toBe('berner')
    expect(getTheme('pink').id).toBe('standard')
    expect(getTheme(undefined).id).toBe('standard')
  })

  test('both themes define the same words and texts, none empty', () => {
    const standard = getTheme('standard')
    const berner = getTheme('berner')
    expect(Object.keys(berner.words).sort()).toEqual(Object.keys(standard.words).sort())
    expect(Object.keys(berner.texts).sort()).toEqual(Object.keys(standard.texts).sort())
    for (const theme of [standard, berner]) {
      for (const [key, value] of Object.entries(theme.words)) expect(value, key).toMatch(/\S/)
    }
  })

  test('berner keeps the wording families know today', () => {
    const { words, appName } = getTheme('berner')
    expect(appName).toBe('Familienchronik')
    expect(words.newsTitle).toBe('Neu im Rudel')
    expect(words.inGroup).toBe('im Rudel')
    expect(getTheme('standard').words.newsTitle).toBe('Neu in der Familie')
  })
})
