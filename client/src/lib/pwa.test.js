import { describe, expect, test, vi } from 'vitest'
import { applyWaitingWorker, canRegisterServiceWorker, watchForWaitingWorker } from './pwa.js'

function fakeTarget() {
  const listeners = {}
  return {
    addEventListener: (type, fn) => {
      listeners[type] = [...(listeners[type] || []), fn]
    },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((entry) => entry !== fn)
    },
    emit: (type, event = {}) => (listeners[type] || []).forEach((fn) => fn(event)),
    count: (type) => (listeners[type] || []).length
  }
}

describe('canRegisterServiceWorker', () => {
  test('nur im Produktions-Build und nur mit Service-Worker-Unterstützung', () => {
    expect(canRegisterServiceWorker({ prod: true, nav: { serviceWorker: {} } })).toBe(true)
    expect(canRegisterServiceWorker({ prod: false, nav: { serviceWorker: {} } })).toBe(false)
    expect(canRegisterServiceWorker({ prod: true, nav: {} })).toBe(false)
  })
})

describe('watchForWaitingWorker: wann „Neue Version verfügbar“ erscheint', () => {
  test('ein schon wartender Worker wird sofort gemeldet', () => {
    const onWaiting = vi.fn()
    const waiting = { state: 'installed' }
    const registration = { ...fakeTarget(), waiting, installing: null }
    watchForWaitingWorker(registration, { serviceWorker: { controller: {} } }, onWaiting)
    expect(onWaiting).toHaveBeenCalledWith(waiting)
  })

  test('ein neu installierter Worker wird gemeldet, sobald er fertig ist - aber nur, wenn schon einer die Seite steuert', () => {
    const onWaiting = vi.fn()
    const registration = { ...fakeTarget(), waiting: null, installing: null }
    const nav = { serviceWorker: { controller: {} } }
    watchForWaitingWorker(registration, nav, onWaiting)

    const worker = { ...fakeTarget(), state: 'installing' }
    registration.installing = worker
    registration.emit('updatefound')
    worker.state = 'installed'
    worker.emit('statechange')
    expect(onWaiting).toHaveBeenCalledWith(worker)
  })

  test('beim allerersten Installieren (noch kein Controller) gibt es keinen Hinweis', () => {
    const onWaiting = vi.fn()
    const registration = { ...fakeTarget(), waiting: null, installing: null }
    watchForWaitingWorker(registration, { serviceWorker: { controller: null } }, onWaiting)
    const worker = { ...fakeTarget(), state: 'installing' }
    registration.installing = worker
    registration.emit('updatefound')
    worker.state = 'installed'
    worker.emit('statechange')
    expect(onWaiting).not.toHaveBeenCalled()
  })
})

describe('applyWaitingWorker: „Neu laden“', () => {
  test('bittet den wartenden Worker zu übernehmen und lädt genau einmal neu, sobald er die Seite steuert', () => {
    const waiting = { postMessage: vi.fn() }
    const serviceWorker = fakeTarget()
    const win = { navigator: { serviceWorker }, location: { reload: vi.fn() } }
    applyWaitingWorker(waiting, win)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    serviceWorker.emit('controllerchange')
    serviceWorker.emit('controllerchange')
    expect(win.location.reload).toHaveBeenCalledTimes(1)
  })

  test('ohne wartenden Worker passiert nichts', () => {
    const win = { navigator: { serviceWorker: fakeTarget() }, location: { reload: vi.fn() } }
    applyWaitingWorker(null, win)
    expect(win.location.reload).not.toHaveBeenCalled()
  })
})
