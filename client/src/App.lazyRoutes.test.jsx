// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

const { me, profile, chunkGate } = vi.hoisted(() => {
  let open
  const promise = new Promise((resolve) => {
    open = resolve
  })
  return { me: vi.fn(), profile: vi.fn(), chunkGate: { promise, open: () => open() } }
})

vi.mock('./api', () => ({
  api: { me, logout: vi.fn(), partnerArea: { profile } },
  setUnauthorizedHandler: () => {}
}))

// Der Chunk der Profilseite (React.lazy in AreaRoutes.jsx) "lädt", bis der Test chunkGate.open() ruft -
// so ist der Platzhalter verlässlich zu sehen, egal wie schnell Vitest das Modul sonst bereitstellt.
vi.mock('./pages/PartnerProfilePage.jsx', async (importOriginal) => {
  await chunkGate.promise
  return importOriginal()
})

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const partner = { id: 7, slug: 'hundeschule-beispielwiese', name: 'Hundeschule Beispielwiese', typ: 'hundeschule', status: 'entwurf', gesperrt: false }
const partnerArea = {
  id: 70,
  name: partner.name,
  theme: 'standard',
  art: 'partner',
  isDemo: false,
  home: { id: 70, name: partner.name, theme: 'standard', art: 'partner' },
  memberships: [],
  auth: { kind: 'key' },
  partner
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  delete document.documentElement.dataset.theme
  document.title = ''
})

function fallbackInMain() {
  return [...container.querySelectorAll('main [role="status"]')].find((el) => el.textContent === 'Lädt …') || null
}

test('eine erst bei Bedarf geladene Seite zeigt in <main> zuerst "Lädt …" (Kopf und Navigation stehen schon), dann die Seite', async () => {
  me.mockResolvedValue(partnerArea)
  profile.mockResolvedValue({ ...partner, vollstaendig: { ok: false, fehlt: ['Postleitzahl'], empfohlen: [] } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/profil']}>
        <App />
      </MemoryRouter>
    )
  )

  expect(fallbackInMain()).not.toBeNull()
  expect(container.querySelector('.app-header .app-nav a[href="/profil"]')).not.toBeNull()
  expect(container.querySelector('main h1')).toBeNull()
  expect(profile).not.toHaveBeenCalled()

  chunkGate.open()
  await act(() => vi.dynamicImportSettled())

  expect(fallbackInMain()).toBeNull()
  expect(container.querySelector('main h1').textContent).toBe('Hundeschule Beispielwiese')
  expect(profile).toHaveBeenCalledTimes(1)
  expect(container.querySelector('.partner-status-badge').textContent).toBe('Entwurf')
})
