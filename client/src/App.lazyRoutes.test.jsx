// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

const { me, profile, chunk } = vi.hoisted(() => {
  function deferred() {
    let resolve
    const promise = new Promise((done) => {
      resolve = done
    })
    return { promise, resolve }
  }
  // release: gibt der Test frei, wenn der Chunk "fertig geladen" sein soll. delivered: meldet die
  // Mock-Factory, sobald sie das echte Modul in der Hand hat.
  return { me: vi.fn(), profile: vi.fn(), chunk: { release: deferred(), delivered: deferred() } }
})

vi.mock('./api', () => ({
  api: { me, logout: vi.fn(), partnerArea: { profile } },
  setUnauthorizedHandler: () => {}
}))

// Der Chunk der Profilseite (React.lazy in AreaRoutes.jsx) "lädt", bis der Test chunk.release freigibt -
// so ist der Platzhalter verlässlich zu sehen. Das Ende des Ladens meldet die Factory selbst über
// chunk.delivered: vi.dynamicImportSettled() taugt hier nicht, es sieht weder die wartende Factory noch
// die Pfad-Auflösung in importOriginal() (RPC an den Vitest-Hauptprozess) und kehrt unter Last zu früh
// zurück - dann rendert React die Seite erst nach den Prüfungen.
vi.mock('./pages/PartnerProfilePage.jsx', async (importOriginal) => {
  await chunk.release.promise
  const actual = await importOriginal()
  chunk.delivered.resolve()
  return actual
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

  chunk.release.resolve()
  // Zwischen Factory und React.lazy liegt nur noch Promise-Verkettung ohne I/O: nach delivered und einem
  // Macrotask hat React das Modul sicher, act rendert dann die Seite samt geladenem Profil.
  await act(async () => {
    await chunk.delivered.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  expect(fallbackInMain()).toBeNull()
  expect(container.querySelector('main h1').textContent).toBe('Hundeschule Beispielwiese')
  expect(profile).toHaveBeenCalledTimes(1)
  expect(container.querySelector('.partner-status-badge').textContent).toBe('Entwurf')
})
