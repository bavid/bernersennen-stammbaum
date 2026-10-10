// Teilen oder Speichern der fertigen Grüße-Karte - nur Browser-Funktionen, nichts geht an einen Server.

// Datei für navigator.share (Handy) - null, wo der Browser keine Dateien teilen kann.
export function shareableFile(blob, fileName, nav = globalThis.navigator) {
  if (!blob || typeof nav?.share !== 'function' || typeof nav?.canShare !== 'function') return null
  try {
    const file = new File([blob], fileName, { type: 'image/png' })
    return nav.canShare({ files: [file] }) ? file : null
  } catch {
    return null
  }
}

// true: geteilt; false: abgebrochen (kein Fehler). Andere Fehler gehen an den Aufrufer.
export async function shareFile(file, nav = globalThis.navigator) {
  try {
    await nav.share({ files: [file] })
    return true
  } catch (error) {
    if (error?.name === 'AbortError') return false
    throw error
  }
}

// PNG über einen Download-Link speichern.
export function downloadBlob(blob, fileName, doc = globalThis.document, urlApi = globalThis.URL) {
  const href = urlApi.createObjectURL(blob)
  const link = doc.createElement('a')
  link.href = href
  link.download = fileName
  link.rel = 'noopener'
  doc.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => urlApi.revokeObjectURL(href), 0)
}
