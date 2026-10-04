// localStorage nur für Komfort-Einstellungen; kann in privaten Fenstern fehlen.
export function readSetting(key, fallback) {
  try {
    const value = window.localStorage.getItem(`chronik.${key}`)
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

export function removeSetting(key) {
  try {
    window.localStorage.removeItem(`chronik.${key}`)
  } catch {
    // ohne Speicher gibt es nichts zu entfernen
  }
}

export function writeSetting(key, value) {
  try {
    window.localStorage.setItem(`chronik.${key}`, JSON.stringify(value))
  } catch {
    // Speichern ist optional
  }
}
