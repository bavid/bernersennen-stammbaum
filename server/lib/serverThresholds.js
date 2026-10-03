'use strict'

// Phase G Task 6, Admin-Reiter „Server“: Warnschwellen der Ampel - gemeinsam für die Anzeige (lib/serverMetrics.js) und
// die Telegram-Warnungen (lib/serverWarnings.js). Speicher und Platte in Prozent belegt, die Last als 1-Minuten-Last je
// CPU-Kern (bei 2 Kernen also 1,5 gelb und 2,0 rot, wie im Plan). Über gelb = erhöht, über rot = kritisch.

const THRESHOLDS = Object.freeze({
  speicher: Object.freeze({ gelb: 80, rot: 90 }),
  platte: Object.freeze({ gelb: 70, rot: 85 }),
  last: Object.freeze({ gelb: 0.75, rot: 1 })
})

const AMPEL = Object.freeze({ ok: 'ok', erhoeht: 'erhoeht', kritisch: 'kritisch' })

// 'ok' | 'erhoeht' | 'kritisch' - oder null ohne gültigen Wert.
function ampel(value, { gelb, rot }) {
  if (!Number.isFinite(value)) return null
  if (value > rot) return AMPEL.kritisch
  if (value > gelb) return AMPEL.erhoeht
  return AMPEL.ok
}

// Belegt in Prozent wie df: belegt / (belegt + frei) - ohne Werte null.
function usedPercent(used, free) {
  const sum = used + free
  return Number.isFinite(sum) && sum > 0 ? (used / sum) * 100 : null
}

module.exports = { THRESHOLDS, AMPEL, ampel, usedPercent }
