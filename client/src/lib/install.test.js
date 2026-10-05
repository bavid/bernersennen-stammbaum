// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  INSTALL_HINT_DAYS,
  captureInstallPrompt,
  detectPlatform,
  dismissInstallHint,
  isInstallHintDismissed,
  isStandalone,
  promptInstall,
  resetInstallPromptForTests,
  subscribeInstallPrompt
} from './install.js'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

afterEach(() => {
  window.localStorage.clear()
  resetInstallPromptForTests()
})

describe('detectPlatform', () => {
  test('erkennt iPhone, iPad (auch mit Mac-Kennung und Touch), Android und sonst Desktop', () => {
    expect(detectPlatform(IPHONE, 0)).toBe('ios')
    expect(detectPlatform(IPAD_DESKTOP_UA, 5)).toBe('ios')
    expect(detectPlatform(IPAD_DESKTOP_UA, 0)).toBe('desktop')
    expect(detectPlatform(ANDROID, 5)).toBe('android')
    expect(detectPlatform(WINDOWS, 0)).toBe('desktop')
    expect(detectPlatform('', 0)).toBe('desktop')
  })
})

describe('isStandalone: läuft die App schon installiert?', () => {
  test('über display-mode oder das iOS-Flag navigator.standalone', () => {
    const matchMedia = (query) => ({ matches: query === '(display-mode: standalone)' })
    expect(isStandalone({ matchMedia, navigator: {} })).toBe(true)
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } })).toBe(true)
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: false } })).toBe(false)
    expect(isStandalone({ navigator: {} })).toBe(false)
  })
})

describe('Hinweis ausblenden („Später“)', () => {
  test('bleibt 30 Tage weg und kommt danach wieder', () => {
    const now = Date.parse('2026-10-05T10:00:00Z')
    expect(isInstallHintDismissed(now)).toBe(false)
    dismissInstallHint(now)
    expect(isInstallHintDismissed(now)).toBe(true)
    expect(isInstallHintDismissed(now + (INSTALL_HINT_DAYS - 1) * 86_400_000)).toBe(true)
    expect(isInstallHintDismissed(now + (INSTALL_HINT_DAYS + 1) * 86_400_000)).toBe(false)
  })
})

describe('beforeinstallprompt (Android/Chrome)', () => {
  function fakeWindow() {
    const listeners = {}
    return {
      addEventListener: (type, fn) => {
        listeners[type] = fn
      },
      emit: (type, event) => listeners[type]?.(event)
    }
  }

  test('fängt das Ereignis ab, meldet es Abonnenten (auch nachträglich) und zeigt den Dialog erst auf Wunsch', async () => {
    const win = fakeWindow()
    captureInstallPrompt(win)
    const event = { preventDefault: vi.fn(), prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) }
    win.emit('beforeinstallprompt', event)
    expect(event.preventDefault).toHaveBeenCalled()

    const seen = vi.fn()
    const unsubscribe = subscribeInstallPrompt(seen)
    expect(seen).toHaveBeenCalledWith(true)

    expect(await promptInstall()).toBe('accepted')
    expect(event.prompt).toHaveBeenCalledTimes(1)
    // verbraucht: ein zweites Mal gibt es den Dialog nicht
    expect(await promptInstall()).toBe(null)
    expect(seen).toHaveBeenLastCalledWith(false)
    unsubscribe()
  })

  test('nach „appinstalled“ gibt es keinen Dialog mehr', async () => {
    const win = fakeWindow()
    captureInstallPrompt(win)
    const seen = vi.fn()
    subscribeInstallPrompt(seen)
    win.emit('beforeinstallprompt', { preventDefault() {}, prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) })
    expect(seen).toHaveBeenLastCalledWith(true)
    win.emit('appinstalled')
    expect(seen).toHaveBeenLastCalledWith(false)
    expect(await promptInstall()).toBe(null)
  })
})
