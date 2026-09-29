// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, adminMe, printBatch, config, overview, partners } = vi.hoisted(() => ({
  me: vi.fn(),
  adminMe: vi.fn(),
  printBatch: vi.fn(),
  config: vi.fn(),
  overview: vi.fn(),
  partners: vi.fn()
}))

vi.mock('./api', () => ({
  api: {
    me,
    config,
    logout: vi.fn(),
    admin: {
      me: adminMe,
      printBatch,
      overview,
      partners,
      voucherCsvUrl: (id) => `/api/admin/voucher-batches/${id}/export.csv`
    }
  },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  // Kein Rudel-Login - die Admin-Routen sind davon unabhängig.
  me.mockRejectedValue(new Error('Fehler 401'))
  config.mockResolvedValue({ appEnv: 'prod', publicUrl: 'https://beispiel-chronik.de' })
  overview.mockReturnValue(new Promise(() => {}))
  partners.mockResolvedValue([])
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vi.clearAllMocks()
  delete document.documentElement.dataset.theme
  document.title = ''
})

const WAIT_STEP_MS = 10
const WAIT_MAX_MS = 3000

// Die Chunks von Druckseite und Admin (React.lazy in App.jsx) lädt Vitest über echte dynamische Importe -
// wie lange das dauert, hängt von der Last ab. Deshalb warten, bis weder der Platzhalter "Lädt …" noch der
// Splash (aria-busy, solange api.admin.me offen ist) mehr zu sehen ist. Leer zählt ebenfalls als "noch
// nicht fertig": die Weiterleitung von <Navigate> läuft als Transition, während der Admin-Chunk lädt,
// bleibt statt des Platzhalters das (leere) Ergebnis von Navigate stehen.
function isSettled() {
  return container.firstChild !== null && !container.querySelector('[role="status"], [aria-busy="true"]')
}

async function render(path) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    )
  )
  const start = Date.now()
  while (!isSettled() && Date.now() - start < WAIT_MAX_MS) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
    })
  }
  return container
}

describe('Route /admin/gutscheine/:id/druck', () => {
  test('mit Admin-Sitzung zeigt sie die Druckseite des Stapels', async () => {
    adminMe.mockResolvedValue({ username: 'admin' })
    printBatch.mockResolvedValue({
      batch: { id: 4, label: 'Herbstkarten', zweck: 'chronik', partnerTyp: null, partner: null },
      codes: ['ABCD-EFGH-JKLM', 'NPQR-STUV-WXYZ'],
      nichtDruckbar: 0
    })
    await render('/admin/gutscheine/4/druck')

    expect(printBatch).toHaveBeenCalledWith('4')
    expect(container.querySelector('.print-page h1').textContent).toBe('Herbstkarten')
    expect(container.querySelectorAll('.voucher-card')).toHaveLength(2)
    // Kein Admin-Dashboard und keine App-Hülle drumherum.
    expect(container.querySelector('.admin-header')).toBeNull()
    expect(container.querySelector('.app-header')).toBeNull()
  })

  test('ohne Admin-Sitzung landet man auf /admin beim Admin-Login, Druckdaten werden nicht geladen', async () => {
    adminMe.mockRejectedValue(new Error('Fehler 401'))
    await render('/admin/gutscheine/4/druck')

    expect(container.querySelector('#admin-user')).not.toBeNull()
    expect(container.querySelector('.admin-login')).not.toBeNull()
    expect(printBatch).not.toHaveBeenCalled()
    expect(container.querySelector('.print-page')).toBeNull()
  })

  test('ein Pfad ohne Zahl als Id bleibt beim Admin-Dashboard', async () => {
    adminMe.mockRejectedValue(new Error('Fehler 401'))
    await render('/admin/gutscheine/abc/druck')

    expect(printBatch).not.toHaveBeenCalled()
    expect(container.querySelector('.admin-login')).not.toBeNull()
  })
})
