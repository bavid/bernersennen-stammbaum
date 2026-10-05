import { readSetting, writeSetting } from './storage.js'

// „Als App aufs Handy“ (components/InstallHint.jsx, pages/AppPage.jsx): Plattform erkennen, merken, dass der Hinweis
// weggeklickt wurde, und den Installations-Dialog von Chrome/Android (beforeinstallprompt) abfangen, bis jemand
// „App installieren“ drückt. Ehrlich: ohne App Store, über den Browser - iOS kann nur den Weg über „Teilen“.
export const INSTALL_HINT_DAYS = 30
const DAY_MS = 86_400_000
const DISMISSED_KEY = 'installHintDismissedAt'

// 'ios' (iPhone, iPad - auch mit Mac-Kennung, dann verrät nur Touch das iPad), 'android' oder 'desktop'.
export function detectPlatform(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints || 0) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

// Läuft die App schon vom Startbildschirm aus (display-mode standalone, auf iOS navigator.standalone)?
export function isStandalone(win = window) {
  try {
    if (win.matchMedia?.('(display-mode: standalone)')?.matches) return true
  } catch {
    // ohne matchMedia zählt nur das iOS-Flag
  }
  return win.navigator?.standalone === true
}

export function isInstallHintDismissed(now = Date.now()) {
  const at = Number(readSetting(DISMISSED_KEY, 0))
  return at > 0 && now - at < INSTALL_HINT_DAYS * DAY_MS
}

export function dismissInstallHint(now = Date.now()) {
  writeSetting(DISMISSED_KEY, now)
}

// beforeinstallprompt feuert oft, bevor React die Hinweis-Karte zeigt - darum fängt main.jsx es global ab und hält es
// hier bereit; Abonnenten (die Karte) erfahren, ob gerade ein Dialog möglich ist.
let deferredPrompt = null
const listeners = new Set()

function notify() {
  const available = deferredPrompt !== null
  listeners.forEach((fn) => fn(available))
}

export function captureInstallPrompt(win = window) {
  win.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    notify()
  })
  win.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

// fn(available) - sofort mit dem aktuellen Stand, danach bei jeder Änderung. Gibt das Abbestellen zurück.
export function subscribeInstallPrompt(fn) {
  listeners.add(fn)
  fn(deferredPrompt !== null)
  return () => listeners.delete(fn)
}

// Zeigt den Dialog des Browsers - nur auf Klick. 'accepted' | 'dismissed' | null (kein Dialog möglich).
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return null
  deferredPrompt = null
  notify()
  event.prompt()
  const choice = await event.userChoice
  return choice?.outcome ?? null
}

export function resetInstallPromptForTests() {
  deferredPrompt = null
  listeners.clear()
}
