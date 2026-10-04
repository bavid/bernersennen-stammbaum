// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import RahmenPage from './RahmenPage.jsx'
import { forgetRahmenToken, rahmenLink } from '../lib/rahmenGeraet.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'Ab3_dEf-ghIjkLmNoPqRsTuVwXyZ0123456789abcde'
const STORED_KEY = 'chronik.rahmen.token'

let container
let root

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<RahmenPage />))
  await act(async () => {})
}

function respond(status, body) {
  return vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body })
}

const FOTOS = {
  name: 'Wohnzimmer Oma',
  fotos: [{ url: '/rahmen-foto/a.jpg?g=1&exp=1&sig=x', tierName: 'Nele', datum: '2024-05-12', inErinnerung: false }],
  optionen: { intervall: 30, untertitel: true, uhr: true, nacht: false, mischen: false, heuteZuerst: true, erinnerung: true },
  gueltigBis: '2026-10-04T12:00:00.000Z'
}

beforeEach(() => {
  window.localStorage.clear()
  forgetRahmenToken()
  window.history.replaceState(null, '', '/rahmen')
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  vi.unstubAllGlobals()
  document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove())
})

describe('RahmenPage – Bilderrahmen auf einem anderen Gerät', () => {
  test('Token aus dem #Hash: gemerkt, sofort aus der Adresse entfernt, nur als Header gesendet', async () => {
    const fetchMock = respond(200, FOTOS)
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(null, '', `/rahmen#${TOKEN}`)
    await render()

    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/rahmen')
    expect(JSON.parse(window.localStorage.getItem(STORED_KEY))).toBe(TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/rahmen/fotos')
    expect(url.includes(TOKEN)).toBe(false)
    expect(options.headers).toEqual({ 'X-Rahmen-Token': TOKEN })
    expect(options.credentials).toBe('omit')
    expect(container.querySelector('[aria-label="Bilderrahmen „Wohnzimmer Oma“"]')).not.toBeNull()
    expect(container.querySelector('.frame-img').getAttribute('alt')).toBe('Foto von Nele, 12. Mai 2024')
    expect(container.querySelector('.frame-clock')).not.toBeNull() // Optionen des Rahmen-Links
    expect(document.head.querySelector('meta[name="robots"]').getAttribute('content')).toBe('noindex')
  })

  test('ohne #Hash: das gemerkte Token', async () => {
    window.localStorage.setItem(STORED_KEY, JSON.stringify(TOKEN))
    const fetchMock = respond(200, FOTOS)
    vi.stubGlobal('fetch', fetchMock)
    await render()
    expect(fetchMock.mock.calls[0][1].headers['X-Rahmen-Token']).toBe(TOKEN)
  })

  test('widerrufen: „Dieser Bilderrahmen wurde beendet“ – und das Token ist vergessen', async () => {
    window.localStorage.setItem(STORED_KEY, JSON.stringify(TOKEN))
    vi.stubGlobal('fetch', respond(401, { error: 'Dieser Bilderrahmen wurde beendet', code: 'RAHMEN_BEENDET' }))
    await render()
    expect(container.querySelector('[role="alert"] h1').textContent).toBe('Dieser Bilderrahmen wurde beendet')
    expect(window.localStorage.getItem(STORED_KEY)).toBeNull()
  })

  test('ohne Token: Hinweis, wie man verbindet – keine Anfrage', async () => {
    const fetchMock = respond(200, FOTOS)
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(null, '', '/rahmen#kaputt')
    await render()
    expect(container.textContent).toContain('Noch kein Bilderrahmen verbunden')
    expect(window.location.hash).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Link-Form: Token nur hinter dem #', () => {
    expect(rahmenLink(TOKEN, 'https://pfoten.example')).toBe(`https://pfoten.example/rahmen#${TOKEN}`)
  })
})
