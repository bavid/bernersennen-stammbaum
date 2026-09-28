// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { createHandover } = vi.hoisted(() => ({ createHandover: vi.fn() }))
vi.mock('../api', () => ({ api: { createHandover } }))

import HandoverDialog from './HandoverDialog.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const dog = { id: 7, name: 'Pepper' }

async function render({ isDemo = false, ...props } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <HandoverDialog dog={dog} {...props} />
      </DemoProvider>
    )
  )
  return container
}

function confirmButton() {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Übergabe-Gutschein erzeugen')
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  createHandover.mockReset()
  delete navigator.share
})

describe('HandoverDialog – vor dem Erzeugen', () => {
  test('legt beim bloßen Öffnen NOCH KEINEN Gutschein an - zeigt zuerst die Erklärung und den Erzeugen-Knopf', async () => {
    await render()

    expect(createHandover).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Es wird ein Übergabe-Gutschein erzeugt')
    expect(container.textContent).toContain('Pepper wird als reserviert markiert')
    expect(container.textContent).toContain('ein früherer Übergabe-Code wird ungültig')
    expect(confirmButton()).not.toBeUndefined()
  })

  test('kein Code/Link sichtbar, bevor der Knopf geklickt wurde', async () => {
    await render()
    expect(container.querySelector('.handover-code')).toBeNull()
  })
})

describe('HandoverDialog – "Übergabe-Gutschein erzeugen"', () => {
  test('ruft erst auf Klick api.createHandover auf und zeigt danach den Code groß', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    const onCreated = vi.fn()
    await render({ onCreated })

    await act(async () => confirmButton().click())

    expect(createHandover).toHaveBeenCalledWith(7)
    expect(container.querySelector('.handover-code').textContent).toBe('ABCD-1234-EFGH')
    expect(onCreated).toHaveBeenCalled()
  })

  test('zeigt den vollen Übergabe-Link inklusive Ursprung', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    await render()
    await act(async () => confirmButton().click())

    expect(container.querySelector('.handover-link').textContent).toBe(`${window.location.origin}/v#ABCD1234EFGH`)
  })

  test('zeigt den Hinweistext, den Code den neuen Menschen zu geben', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    await render()
    await act(async () => confirmButton().click())

    expect(container.textContent).toContain('Gebt den Code den neuen Menschen')
    expect(container.textContent).toContain('Pepper')
  })

  test('"Code kopieren" schreibt den Code in die Zwischenablage', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await render()
    await act(async () => confirmButton().click())

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Code kopieren'))
    await act(async () => button.click())

    expect(writeText).toHaveBeenCalledWith('ABCD-1234-EFGH')
  })

  test('zeigt einen Fehler, wenn das Erzeugen fehlschlägt, und bleibt auf dem Erklär-Schritt (erneut versuchbar)', async () => {
    createHandover.mockRejectedValue(new Error('Es gibt bereits einen offenen Übergabe-Gutschein'))
    await render()
    await act(async () => confirmButton().click())

    expect(container.querySelector('.error-banner').textContent).toBe('Es gibt bereits einen offenen Übergabe-Gutschein')
    expect(confirmButton()).not.toBeUndefined()
  })
})

describe('HandoverDialog – Demo (final-review Phase T Finding 8)', () => {
  test('"Übergabe-Gutschein erzeugen" ist in der Demo gesperrt, mit Hinweis', async () => {
    await render({ isDemo: true })

    expect(confirmButton().disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')

    await act(async () => confirmButton().click())
    expect(createHandover).not.toHaveBeenCalled()
  })
})
