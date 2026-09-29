import { describe, expect, test } from 'vitest'
import { NO_NAME, excerpt, formatMessageDate, isoDateTime, senderName } from './partnerInbox.js'
import { mailtoHref } from './format.js'

describe('senderName', () => {
  test('Name oder "Ohne Namen"', () => {
    expect(senderName({ name: 'Wilma' })).toBe('Wilma')
    expect(senderName({ name: '  ' })).toBe(NO_NAME)
    expect(senderName({ name: null })).toBe('Ohne Namen')
  })
})

describe('excerpt', () => {
  test('Zeilenumbrüche werden zu Leerzeichen, lange Texte gekürzt', () => {
    expect(excerpt('Hallo\n\nzusammen')).toBe('Hallo zusammen')
    const long = excerpt('Wort '.repeat(40))
    expect(long.length).toBeLessThanOrEqual(90)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('formatMessageDate', () => {
  test('deutsches Datum mit Uhrzeit (Mittag UTC: in jeder üblichen Zeitzone derselbe Tag)', () => {
    expect(formatMessageDate('2026-09-20 12:00:00')).toMatch(/^20\. September 2026/)
    expect(isoDateTime('2026-09-20 12:00:00')).toBe('2026-09-20T12:00:00.000Z')
  })

  test('ungültige Werte ergeben einen leeren Text', () => {
    expect(formatMessageDate('gestern')).toBe('')
    expect(formatMessageDate(null)).toBe('')
    expect(isoDateTime(undefined)).toBeUndefined()
  })
})

describe('mailtoHref', () => {
  test('nur eine plausible Adresse wird zum mailto-Link', () => {
    expect(mailtoHref('wilma@example.org')).toBe('mailto:wilma@example.org')
    expect(mailtoHref('wilma@example.org?subject=x')).toBeNull()
    expect(mailtoHref('javascript:alert(1)')).toBeNull()
    expect(mailtoHref(null)).toBeNull()
  })
})
