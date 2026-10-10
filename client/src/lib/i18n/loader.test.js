// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_MAX_AGE_MS, CACHE_PREFIX, loadMessages, readCache } from './loader.js'

const NOW = 1_800_000_000_000
const MESSAGES = { Anmelden: 'Sign in (API)' }

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body }
}

// Antworten je Adresse: Manifest und Wörterbuch.
function fakeFetch({ version = 'abc123def456', messages = MESSAGES, manifestOk = true } = {}) {
  return vi.fn(async (url) => {
    if (url === '/api/i18n') return response({ languages: ['de', 'en'], versions: { en: version } }, manifestOk)
    if (url === `/api/i18n/en?v=${version}`) return response(messages)
    return response({ error: 'Nicht gefunden' }, false)
  })
}

const api = (fetchImpl, now = NOW) => ({ useApi: true, fetchImpl, now })

describe('i18n loader', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('holt Manifest und Wörterbuch und legt beides in den Browser-Speicher', async () => {
    const fetchImpl = fakeFetch()
    expect(await loadMessages('en', api(fetchImpl))).toEqual(MESSAGES)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(readCache('en')).toEqual({ version: 'abc123def456', savedAt: NOW, messages: MESSAGES })
  })

  it('nimmt den Speicher, solange Version gleich und jünger als 7 Tage', async () => {
    window.localStorage.setItem(`${CACHE_PREFIX}en`, JSON.stringify({ version: 'abc123def456', savedAt: NOW - 1000, messages: { a: 'cached' } }))
    const fetchImpl = fakeFetch()
    expect(await loadMessages('en', api(fetchImpl))).toEqual({ a: 'cached' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('lädt neu bei neuer Version oder zu altem Speicher', async () => {
    window.localStorage.setItem(`${CACHE_PREFIX}en`, JSON.stringify({ version: 'alt', savedAt: NOW, messages: { a: 'alt' } }))
    expect(await loadMessages('en', api(fakeFetch()))).toEqual(MESSAGES)
    window.localStorage.setItem(
      `${CACHE_PREFIX}en`,
      JSON.stringify({ version: 'abc123def456', savedAt: NOW - CACHE_MAX_AGE_MS - 1, messages: { a: 'alt' } })
    )
    const fetchImpl = fakeFetch()
    expect(await loadMessages('en', api(fetchImpl))).toEqual(MESSAGES)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('fällt ohne API auf den Quelltext zurück', async () => {
    const messages = await loadMessages('en', api(fakeFetch({ manifestOk: false })))
    expect(messages['login.signIn']).toBe('Sign in')
    const offline = vi.fn().mockRejectedValue(new TypeError('offline'))
    expect((await loadMessages('en', api(offline)))['login.signIn']).toBe('Sign in')
    expect(readCache('en')).toBeNull()
  })

  it('verwirft ein ungültiges Wörterbuch und kaputten Speicher', async () => {
    window.localStorage.setItem(`${CACHE_PREFIX}en`, '{kaputt')
    expect(readCache('en')).toBeNull()
    const messages = await loadMessages('en', api(fakeFetch({ messages: ['kein', 'objekt'] })))
    expect(messages['login.signIn']).toBe('Sign in')
  })

  it('übersteht einen gesperrten Speicher', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(await loadMessages('en', api(fakeFetch()))).toEqual(MESSAGES)
  })

  it('lehnt unbekannte Sprachen ab', async () => {
    await expect(loadMessages('xx', api(fakeFetch()))).rejects.toThrow('Unbekannte Sprache')
  })
})
