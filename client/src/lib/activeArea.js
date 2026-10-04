// Phase W (Ruhige Hülle): welcher Bereich gerade auf dem Bildschirm steht - api.js schickt ihn mit jeder Anfrage als
// Header X-Bereich (server/lib/areaHeader.js). Hat ein zweiter Tab die Sitzung inzwischen in einen anderen Bereich
// gewechselt, antwortet der Server mit 409 {code:'BEREICH'}; dann meldet api.js das hier (reportAreaMismatch), App.jsx
// lädt /me neu und das AreaGate der Seite schaltet zurück. Ein eigenes Modul statt api.js, damit die vielen Tests, die
// './api' durch ein Mock ersetzen, App.jsx weiter laden können.

export const AREA_HEADER = 'X-Bereich'
export const AREA_MISMATCH_CODE = 'BEREICH'

let activeAreaId = null
let mismatchHandler = () => {}

// App.jsx bei jedem Rendern: die Id des angezeigten Bereichs (family.id) oder null ohne Sitzung.
export function setActiveArea(id) {
  activeAreaId = Number.isInteger(id) && id > 0 ? id : null
}

export function activeArea() {
  return activeAreaId
}

// Kopfzeilen für eine API-Anfrage: { 'X-Bereich': '5' } bzw. {} ohne bekannten Bereich.
export function areaHeaders() {
  return activeAreaId ? { [AREA_HEADER]: String(activeAreaId) } : {}
}

export function setAreaMismatchHandler(handler) {
  mismatchHandler = typeof handler === 'function' ? handler : () => {}
}

export function reportAreaMismatch() {
  mismatchHandler()
}
