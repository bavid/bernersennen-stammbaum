import { describe, expect, test, vi } from 'vitest'
import { handlePush, notificationOptions, parsePayload, safeUrl } from './push.js'

describe('Service Worker - Push', () => {
  test('safeUrl: nur eigene Pfade, sonst /start', () => {
    expect(safeUrl('/start')).toBe('/start')
    expect(safeUrl('/tiere/4')).toBe('/tiere/4')
    expect(safeUrl('https://boese.example/')).toBe('/start')
    expect(safeUrl('//boese.example/')).toBe('/start')
    expect(safeUrl(undefined)).toBe('/start')
  })

  test('notificationOptions: Text, Symbol, ein Tag je Ereignis, Ziel in data', () => {
    const options = notificationOptions({ titel: 'Neuer Gruß', text: 'Jemand hat gegrüßt.', ereignis: 'gruss', url: '/start' })
    expect(options.body).toBe('Jemand hat gegrüßt.')
    expect(options.icon).toBe('/icons/icon-192.png')
    expect(options.tag).toBe('pfoten-gruss')
    expect(options.data).toEqual({ url: '/start' })
    expect(notificationOptions({ titel: 'x' }).body).toBe('')
  })

  test('parsePayload: nur gültiges JSON mit Titel', () => {
    expect(parsePayload({ data: { json: () => ({ titel: 'Neuer Gast', text: 'Jemand ist da.' }) } })).toEqual({ titel: 'Neuer Gast', text: 'Jemand ist da.' })
    expect(parsePayload({ data: { json: () => ({ text: 'ohne Titel' }) } })).toBe(null)
    expect(parsePayload({ data: { json: () => { throw new SyntaxError('kaputt') } } })).toBe(null)
    expect(parsePayload({ data: null })).toBe(null)
  })

  test('handlePush zeigt die Mitteilung - ohne gültige Nachricht nichts', () => {
    const showNotification = vi.fn(() => Promise.resolve())
    globalThis.self = { registration: { showNotification } }
    const waitUntil = vi.fn()
    handlePush({ data: { json: () => ({ titel: 'Neuer Gruß', text: 'Jemand hat gegrüßt.', ereignis: 'gruss' }) }, waitUntil })
    expect(showNotification).toHaveBeenCalledWith('Neuer Gruß', expect.objectContaining({ body: 'Jemand hat gegrüßt.' }))
    expect(waitUntil).toHaveBeenCalledTimes(1)
    handlePush({ data: null, waitUntil })
    expect(waitUntil).toHaveBeenCalledTimes(1)
    delete globalThis.self
  })
})
