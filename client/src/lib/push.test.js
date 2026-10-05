import { describe, expect, test } from 'vitest'
import { PUSH_STATUS, PUSH_SUPPORT, pushStatus, pushSupport, urlBase64ToUint8Array } from './push.js'

const full = { nav: { serviceWorker: {} }, win: { PushManager: {}, Notification: {} } }

describe('pushSupport', () => {
  test('Android/Desktop mit den APIs: ok; ohne eine API: unsupported', () => {
    expect(pushSupport({ ...full, platform: 'android', standalone: false })).toBe(PUSH_SUPPORT.ok)
    expect(pushSupport({ nav: {}, win: full.win, platform: 'desktop', standalone: false })).toBe(PUSH_SUPPORT.unsupported)
    expect(pushSupport({ nav: full.nav, win: { Notification: {} }, platform: 'desktop', standalone: false })).toBe(PUSH_SUPPORT.unsupported)
  })

  test('iPhone im Browser: erst installieren; vom Home-Bildschirm mit den APIs: ok', () => {
    expect(pushSupport({ nav: {}, win: {}, platform: 'ios', standalone: false })).toBe(PUSH_SUPPORT.iosInstall)
    expect(pushSupport({ ...full, platform: 'ios', standalone: true })).toBe(PUSH_SUPPORT.ok)
  })
})

describe('pushStatus', () => {
  test('blockiert schlägt alles, an nur mit Erlaubnis und Abo', () => {
    expect(pushStatus({ permission: 'denied', subscribed: true })).toBe(PUSH_STATUS.blockiert)
    expect(pushStatus({ permission: 'granted', subscribed: true })).toBe(PUSH_STATUS.an)
    expect(pushStatus({ permission: 'granted', subscribed: false })).toBe(PUSH_STATUS.aus)
    expect(pushStatus({ permission: 'default', subscribed: false })).toBe(PUSH_STATUS.aus)
  })
})

describe('urlBase64ToUint8Array', () => {
  test('wandelt base64url (ohne Padding) in Bytes', () => {
    // "hallo" -> aGFsbG8 (base64url ohne =)
    expect([...urlBase64ToUint8Array('aGFsbG8')]).toEqual([104, 97, 108, 108, 111])
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255])
  })
})
