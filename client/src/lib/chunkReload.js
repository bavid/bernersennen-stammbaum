// Nach einem Deploy liegen die Chunks der alten Version nicht mehr in dist/ (vite build leert den Ordner).
// Eine noch offene Seite, die erst jetzt eine bei Bedarf geladene Seite anfordert (React.lazy in App.jsx
// und AreaRoutes.jsx), bekäme einen Ladefehler und stünde leer da. Vite meldet das als
// 'vite:preloadError' - dann einmal neu laden, das holt die aktuelle Version. Die Sperre in sessionStorage
// verhindert eine Neulade-Schleife, falls der Chunk auch danach fehlt (dann bleibt es beim Fehler).
const RELOAD_KEY = 'chronik.chunkReloadAt'
const RELOAD_COOLDOWN_MS = 10_000

export function reloadAfterChunkError(win, now = Date.now()) {
  try {
    const last = Number(win.sessionStorage.getItem(RELOAD_KEY)) || 0
    if (now - last < RELOAD_COOLDOWN_MS) return false
    win.sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // Ohne sessionStorage gibt es keine Sperre gegen eine Schleife - dann lieber nicht neu laden.
    return false
  }
  win.location.reload()
  return true
}

export function installChunkReload(win = window) {
  win.addEventListener('vite:preloadError', () => reloadAfterChunkError(win))
}
