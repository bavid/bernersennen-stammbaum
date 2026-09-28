// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { createHandover } = vi.hoisted(() => ({ createHandover: vi.fn() }))
vi.mock('../api', () => ({ api: { createHandover } }))

import HandoverDialog from './HandoverDialog.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const dog = { id: 7, name: 'Pepper' }

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<HandoverDialog dog={dog} {...props} />))
  return container
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

describe('HandoverDialog', () => {
  test('erzeugt beim Öffnen sofort einen Gutschein (api.createHandover) und zeigt den Code groß', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    const onCreated = vi.fn()
    await render({ onCreated })

    expect(createHandover).toHaveBeenCalledWith(7)
    expect(container.querySelector('.handover-code').textContent).toBe('ABCD-1234-EFGH')
    expect(onCreated).toHaveBeenCalled()
  })

  test('zeigt den vollen Übergabe-Link inklusive Ursprung', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    await render()

    expect(container.querySelector('.handover-link').textContent).toBe(`${window.location.origin}/v#ABCD1234EFGH`)
  })

  test('zeigt den Hinweistext, den Code den neuen Menschen zu geben', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    await render()

    expect(container.textContent).toContain('Gebt den Code den neuen Menschen')
    expect(container.textContent).toContain('Pepper')
  })

  test('"Code kopieren" schreibt den Code in die Zwischenablage', async () => {
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await render()

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Code kopieren'))
    await act(async () => button.click())

    expect(writeText).toHaveBeenCalledWith('ABCD-1234-EFGH')
  })

  test('zeigt einen Fehler, wenn das Erzeugen fehlschlägt', async () => {
    createHandover.mockRejectedValue(new Error('Es gibt bereits einen offenen Übergabe-Gutschein'))
    await render()

    expect(container.querySelector('.error-banner').textContent).toBe('Es gibt bereits einen offenen Übergabe-Gutschein')
  })
})
