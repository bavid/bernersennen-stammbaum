// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('../api', () => ({ api: { config } }))

import PartnerShareSection from './PartnerShareSection.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let writeText

const profile = {
  slug: 'hundeschule-kiesel',
  name: 'Hundeschule Kieselweg',
  typ: 'hundeschule',
  status: 'aktiv',
  gesperrt: false,
  farbe: '#1f5f8b'
}

const PORTAL_URL = 'https://chronik.example.org/p/hundeschule-kiesel'

beforeEach(() => {
  config.mockResolvedValue({ publicUrl: 'https://chronik.example.org' })
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  config.mockReset()
  vi.restoreAllMocks()
})

async function render(props = {}, { isDemo = false, adminView = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={adminView ? { isDemo, adminView } : isDemo}>
        <PartnerShareSection profile={{ ...profile, ...props }} />
      </DemoProvider>
    )
  )
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(label))
}

function copyButtonFor(id) {
  return container.querySelector(`#${id}`).closest('.copy-field').querySelector('button')
}

describe('PartnerShareSection', () => {
  test('zeigt den Portal-Link aus PUBLIC_URL; "Kopieren" legt ihn in die Zwischenablage', async () => {
    await render()
    expect(container.querySelector('#partner-share-url').value).toBe(PORTAL_URL)

    await act(async () => copyButtonFor('partner-share-url').click())

    expect(writeText).toHaveBeenCalledWith(PORTAL_URL)
    expect(copyButtonFor('partner-share-url').textContent).toContain('Kopiert')
    expect(container.querySelector('[role="status"]').textContent).toBe('Link zu eurem Portal kopiert.')
  })

  test('ohne Zwischenablage-Recht wird der Text markiert und ein Hinweis erscheint', async () => {
    writeText.mockRejectedValue(new Error('verweigert'))
    await render()
    const field = container.querySelector('#partner-share-url')
    const select = vi.spyOn(field, 'select')

    await act(async () => copyButtonFor('partner-share-url').click())

    expect(select).toHaveBeenCalled()
    expect(container.textContent).toContain('bitte mit Strg+C kopieren')
  })

  test('der QR-Code zeigt das SVG der Portal-Adresse', async () => {
    await render()
    const img = container.querySelector('.partner-share-qr-code')
    expect(img.getAttribute('alt')).toBe(`QR-Code, öffnet ${PORTAL_URL}`)
    const svg = decodeURIComponent(img.getAttribute('src').replace('data:image/svg+xml;charset=utf-8,', ''))
    expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 \d+ \d+"/)
    expect(svg).toContain('<path')
  })

  test('"QR-Code herunterladen (SVG)" lädt eine SVG-Datei mit dem Slug im Namen herunter', async () => {
    const createObjectURL = vi.fn(() => 'blob:qr')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const clicked = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordClick() {
      clicked.push(this.getAttribute('download'))
    })
    await render()

    await act(async () => button('QR-Code herunterladen (SVG)').click())

    expect(createObjectURL.mock.calls[0][0].type).toBe('image/svg+xml')
    expect(clicked).toEqual(['qr-hundeschule-kiesel.svg'])
  })

  test('der HTML-Knopf verlinkt das Portal, kopierbar, mit Vorschau in der Partnerfarbe', async () => {
    await render()
    const snippet = container.querySelector('#partner-share-snippet').value
    expect(snippet).toContain(`href="${PORTAL_URL}"`)
    expect(snippet).toContain('Uns findet ihr auch auf Familie auf Pfoten')
    expect(snippet).not.toContain('<script')

    await act(async () => copyButtonFor('partner-share-snippet').click())
    expect(writeText).toHaveBeenCalledWith(snippet)
    expect(container.querySelector('.partner-share-preview span[style]').style.background).toBe('rgb(31, 95, 139)')
  })

  test('der Social-Media-Text enthält den Link und ist kopierbar', async () => {
    await render()
    const text = container.querySelector('#partner-share-social').value
    expect(text).toContain(PORTAL_URL)
    await act(async () => copyButtonFor('partner-share-social').click())
    expect(writeText).toHaveBeenCalledWith(text)
  })

  test('noch nicht veröffentlicht: Hinweis und kein "Portal öffnen"', async () => {
    await render({ status: 'entwurf' })
    expect(container.querySelector('.partner-share-note').textContent).toBe('Erst nach dem Veröffentlichen für alle sichtbar.')
    expect(container.querySelector('.partner-share-open')).toBeNull()
  })

  test('veröffentlicht: kein Hinweis, "Portal öffnen" in neuem Tab', async () => {
    await render()
    expect(container.querySelector('.partner-share-note')).toBeNull()
    const open = container.querySelector('.partner-share-open')
    expect(open.getAttribute('href')).toBe(PORTAL_URL)
    expect(open.getAttribute('target')).toBe('_blank')
  })

  test('in der Demo trägt der Link ?demo=1', async () => {
    await render({}, { isDemo: true })
    expect(container.querySelector('#partner-share-url').value).toBe(`${PORTAL_URL}?demo=1`)
  })

  test('ohne PUBLIC_URL gilt der Ursprung der Seite', async () => {
    config.mockResolvedValue({ publicUrl: null })
    await render()
    expect(container.querySelector('#partner-share-url').value).toBe(`${window.location.origin}/p/hundeschule-kiesel`)
  })

  test('solange /api/config nicht geantwortet hat, gibt es nichts zu kopieren (keine vorläufige Adresse)', async () => {
    let resolveConfig
    config.mockReturnValue(new Promise((resolve) => (resolveConfig = resolve)))
    await render()
    expect(container.querySelector('#partner-share-url')).toBeNull()
    expect(container.textContent).toContain('Lädt …')

    await act(async () => resolveConfig({ publicUrl: 'https://chronik.example.org' }))
    expect(container.querySelector('#partner-share-url').value).toBe(PORTAL_URL)
  })

  test('scheitert /api/config, gilt der Ursprung der Seite', async () => {
    config.mockRejectedValue(new Error('offline'))
    await render()
    expect(container.querySelector('#partner-share-url').value).toBe(`${window.location.origin}/p/hundeschule-kiesel`)
  })

  test('in der Admin-Ansicht eines echten Partners kein ?demo=1', async () => {
    await render({}, { adminView: true })
    expect(container.querySelector('#partner-share-url').value).toBe(PORTAL_URL)
  })
})
