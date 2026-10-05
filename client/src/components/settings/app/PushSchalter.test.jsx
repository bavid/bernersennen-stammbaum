// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ pushKey: vi.fn(), pushSubscribe: vi.fn(), pushUnsubscribe: vi.fn() }))
vi.mock('../../../api', () => ({ api }))

import PushSchalter from './PushSchalter.jsx'
import { DemoProvider } from '../../../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function fakeClient({ permission = 'default', subscription = null } = {}) {
  let current = subscription
  return {
    currentPermission: () => permission,
    currentSubscription: vi.fn(async () => current),
    subscribePush: vi.fn(async () => {
      if (permission === 'denied') return { permission, subscription: null }
      current = { endpoint: 'https://push.example/neu', toJSON: () => ({ endpoint: 'https://push.example/neu', keys: { p256dh: 'p', auth: 'a' } }) }
      return { permission: 'granted', subscription: current }
    }),
    unsubscribePush: vi.fn(async () => {
      const endpoint = current?.endpoint || null
      current = null
      return endpoint
    })
  }
}

async function render(props, family = { id: 1, isDemo: false }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={family}>
        <PushSchalter support="ok" {...props} />
      </DemoProvider>
    )
  )
}

const flush = () => act(async () => {})
const toggle = () => container.querySelector('input[role="switch"]')
const hint = () => container.querySelector('#push-hint').textContent

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  for (const fn of Object.values(api)) fn.mockReset()
})

describe('PushSchalter: „Benachrichtigungen aufs Handy“', () => {
  test('aus -> einschalten fragt die Erlaubnis erst auf Klick, abonniert und meldet das Abo dem Server', async () => {
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 0 })
    api.pushSubscribe.mockResolvedValue({ ok: true })
    const client = fakeClient()
    await render({ client })
    await flush()
    expect(client.subscribePush).not.toHaveBeenCalled()
    expect(toggle().checked).toBe(false)
    expect(hint()).toBe('Aus')

    await act(async () => toggle().click())
    await flush()
    expect(client.subscribePush).toHaveBeenCalledWith('BKEY')
    expect(api.pushSubscribe).toHaveBeenCalledWith({ endpoint: 'https://push.example/neu', keys: { p256dh: 'p', auth: 'a' } })
    expect(toggle().checked).toBe(true)
    expect(hint()).toMatch(/^An/)
  })

  test('an -> ausschalten kündigt im Browser und auf dem Server', async () => {
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 1 })
    api.pushUnsubscribe.mockResolvedValue(null)
    const client = fakeClient({ permission: 'granted', subscription: { endpoint: 'https://push.example/alt' } })
    await render({ client })
    await flush()
    expect(toggle().checked).toBe(true)
    await act(async () => toggle().click())
    await flush()
    expect(client.unsubscribePush).toHaveBeenCalled()
    expect(api.pushUnsubscribe).toHaveBeenCalledWith('https://push.example/alt')
    expect(toggle().checked).toBe(false)
  })

  test('vom Browser blockiert: Schalter gesperrt mit Hinweis', async () => {
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 0 })
    await render({ client: fakeClient({ permission: 'denied' }) })
    await flush()
    expect(toggle().disabled).toBe(true)
    expect(hint()).toMatch(/Vom Browser blockiert/)
  })

  test('iPhone im Browser: erst installieren; Server ohne Schlüssel: nicht eingerichtet; Demo: nicht möglich', async () => {
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 0 })
    await render({ support: 'ios-install', client: fakeClient() })
    await flush()
    expect(toggle().disabled).toBe(true)
    expect(hint()).toMatch(/Home-Bildschirm.*16\.4/)
    act(() => root.unmount())
    container.remove()

    api.pushKey.mockResolvedValue({ enabled: false, publicKey: null, geraete: 0 })
    await render({ client: fakeClient() })
    await flush()
    expect(toggle().disabled).toBe(true)
    expect(hint()).toMatch(/nicht eingerichtet/)
    act(() => root.unmount())
    container.remove()

    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 0 })
    await render({ client: fakeClient() }, { id: 1, isDemo: true })
    await flush()
    expect(toggle().disabled).toBe(true)
    expect(hint()).toMatch(/Demo/)
  })
})
