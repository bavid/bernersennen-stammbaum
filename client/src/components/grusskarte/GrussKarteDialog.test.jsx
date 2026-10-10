// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { api, renderCard } = vi.hoisted(() => ({ api: { config: vi.fn() }, renderCard: vi.fn() }))
vi.mock('../../api', () => ({ api }))
vi.mock('../../lib/grusskarteCanvas.js', () => ({ renderCard: (...args) => renderCard(...args) }))

import GrussKarteDialog from './GrussKarteDialog.jsx'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
}

const entry = (overrides = {}) => ({ titel: 'Am See', text: 'Ein schöner Tag.', datum: '2024-05-01', foto_urls: ['/uploads/a.jpg'], privat: 0, ...overrides })

let container
let root
const $ = (selector) => container.querySelector(selector)
const buttons = () => [...container.querySelectorAll('.grusskarte-actions button')]

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<GrussKarteDialog entry={entry()} dogName="Benno" onClose={() => {}} {...props} />))
  await act(async () => {})
}

beforeEach(() => {
  api.config.mockResolvedValue({ publicUrl: 'https://chronik.example' })
  renderCard.mockResolvedValue({ blob: new Blob(['png'], { type: 'image/png' }), withPhoto: true })
  URL.createObjectURL = vi.fn(() => 'blob:karte')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  delete navigator.share
  delete navigator.canShare
  vi.restoreAllMocks()
  setLang('de')
})

describe('GrussKarteDialog', () => {
  test('baut die Karte mit QR auf die öffentliche Adresse und zeigt die Vorschau', async () => {
    await render()
    expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ dogName: 'Benno', title: 'Am See', qrUrl: 'https://chronik.example/' }))
    expect($('.grusskarte-preview').getAttribute('src')).toBe('blob:karte')
    expect($('.grusskarte-privat')).toBeNull()
  })

  test('ohne Teilen-Funktion (Computer): nur „Bild speichern“ als Download', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await render()
    expect(buttons().map((b) => b.textContent)).toEqual(['Bild speichern'])
    await act(async () => buttons()[0].click())
    expect(click).toHaveBeenCalled()
  })

  test('Handy: „Teilen“ übergibt die PNG-Datei an navigator.share und schließt', async () => {
    navigator.canShare = vi.fn(() => true)
    navigator.share = vi.fn(async () => {})
    const onClose = vi.fn()
    await render({ onClose })
    expect(buttons().map((b) => b.textContent)).toEqual(['Teilen', 'Bild speichern'])
    await act(async () => buttons()[0].click())
    const [{ files }] = navigator.share.mock.calls[0]
    expect(files[0].name).toBe('gruesse-benno-2024-05-01.png')
    expect(files[0].type).toBe('image/png')
    expect(onClose).toHaveBeenCalled()
  })

  test('Teilen abgebrochen: kein Fehler, Dialog bleibt', async () => {
    navigator.canShare = vi.fn(() => true)
    navigator.share = vi.fn(async () => {
      throw Object.assign(new Error('abort'), { name: 'AbortError' })
    })
    const onClose = vi.fn()
    await render({ onClose })
    await act(async () => buttons()[0].click())
    expect(onClose).not.toHaveBeenCalled()
    expect($('.grusskarte-error')).toBeNull()
  })

  test('private Erinnerung: sanfter Hinweis, dass das Bild die App verlässt', async () => {
    await render({ entry: entry({ privat: 1 }) })
    expect($('.grusskarte-privat').textContent).toContain('verlässt das Bild die App')
  })

  test('Foto nicht ladbar: Hinweis auf Karte nur mit Text', async () => {
    renderCard.mockResolvedValue({ blob: new Blob(['png']), withPhoto: false })
    await render()
    expect(container.textContent).toContain('die Karte zeigt nur den Text')
  })

  test('Fehler beim Zeichnen: freundliche Meldung statt Knöpfen', async () => {
    renderCard.mockRejectedValue(new Error('kaputt'))
    api.config.mockRejectedValue(new Error('offline'))
    await render()
    expect($('.grusskarte-error').textContent).toBe('Die Karte ließ sich auf diesem Gerät nicht erstellen.')
    expect(buttons()).toHaveLength(0)
  })

  test('Englisch', async () => {
    await setLang('en')
    await render({ entry: entry({ privat: 1 }) })
    expect($('#modal-title').textContent).toBe('Share as a card')
    expect(buttons().map((b) => b.textContent)).toEqual(['Save image'])
    expect($('.grusskarte-privat').textContent).toContain('the image leaves the app')
    expect(container.textContent).not.toMatch(/Bild speichern|verlässt/)
  })
})
