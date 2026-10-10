// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ pushKey: vi.fn(), pushSubscribe: vi.fn(), pushUnsubscribe: vi.fn(), pushTest: vi.fn() }))
vi.mock('../../../api', () => ({ api, ApiError: class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
} }))

import PushSchalter from './PushSchalter.jsx'
import { DemoProvider } from '../../../lib/demo.js'
import { setLang } from '../../../lib/i18n/index.js'
import { ApiError } from '../../../api'

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
const testButton = () => [...container.querySelectorAll('button')].find((b) => /test/i.test(b.textContent)) || null
const testStatus = () => container.querySelector('[aria-live="polite"]')?.textContent || ''

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  for (const fn of Object.values(api)) fn.mockReset()
  setLang('de')
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

  test('409 (Endpunkt gehört noch einem anderen Zuhause): einmal im Browser kündigen, neu abonnieren, erneut melden', async () => {
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 0 })
    api.pushSubscribe.mockRejectedValueOnce(Object.assign(new Error('belegt'), { status: 409 })).mockResolvedValueOnce({ ok: true })
    const client = fakeClient()
    await render({ client })
    await flush()
    await act(async () => toggle().click())
    await flush()
    expect(client.unsubscribePush).toHaveBeenCalledTimes(1)
    expect(client.subscribePush).toHaveBeenCalledTimes(2)
    expect(api.pushSubscribe).toHaveBeenCalledTimes(2)
    expect(toggle().checked).toBe(true)
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

  test('Test-Benachrichtigung: nur wenn an, nur an dieses Gerät, gesperrt während des Sendens, Status in aria-live', async () => {
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 0 })
    api.pushSubscribe.mockResolvedValue({ ok: true })
    let resolveSend
    api.pushTest.mockImplementation(() => new Promise((resolve) => (resolveSend = resolve)))
    await render({ client: fakeClient() })
    await flush()
    expect(testButton()).toBeNull()

    await act(async () => toggle().click())
    await flush()
    expect(testButton().textContent).toBe('Test-Benachrichtigung senden')
    await act(async () => testButton().click())
    expect(api.pushTest).toHaveBeenCalledWith('https://push.example/neu', 'de')
    expect(testButton().disabled).toBe(true)
    await act(async () => resolveSend({ ok: true }))
    expect(testButton().disabled).toBe(false)
    expect(testStatus()).toMatch(/Gesendet/)
  })

  test('Test-Benachrichtigung: Server nicht eingerichtet (503) und andere Fehler', async () => {
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 1 })
    api.pushTest.mockRejectedValueOnce(new ApiError('egal', 503)).mockRejectedValueOnce(new ApiError('Höchstens drei Testnachrichten', 429))
    await render({ client: fakeClient({ permission: 'granted', subscription: { endpoint: 'https://push.example/alt' } }) })
    await flush()
    await act(async () => testButton().click())
    expect(testStatus()).toMatch(/nicht eingerichtet/)
    await act(async () => testButton().click())
    expect(testStatus()).toMatch(/Höchstens drei/)
  })

  test('Test-Benachrichtigung auf Englisch (lang en an den Server)', async () => {
    setLang('en')
    api.pushKey.mockResolvedValue({ enabled: true, publicKey: 'BKEY', geraete: 1 })
    api.pushTest.mockResolvedValue({ ok: true })
    await render({ client: fakeClient({ permission: 'granted', subscription: { endpoint: 'https://push.example/alt' } }) })
    await flush()
    expect(testButton().textContent).toBe('Send test notification')
    await act(async () => testButton().click())
    expect(api.pushTest).toHaveBeenCalledWith('https://push.example/alt', 'en')
    expect(testStatus()).toMatch(/Sent/)
  })
})
