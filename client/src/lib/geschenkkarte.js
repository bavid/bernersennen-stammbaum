import { musterCodes } from './visitenkarte.js'

// Weihnachts-Gutscheinkarte (Plan 2027, „Geschenkkarte“): ein Einladungscode als Karte zum Verschenken - vorne ein ruhiges
// Geschenk-Motiv mit „Für …“/„Von …“ zum Ausfüllen von Hand, hinten QR-Code, Code und drei kurze Schritte. Familien
// drucken sie aus dem Einladen-Dialog (components/geschenk/GeschenkkartePanel.jsx: A4, Vorder- und Rückseite übereinander,
// in der Mitte gefaltet = A6 quer), Partner wählen das Motiv im Karten-Designer (lib/kartenWahl.js KARTE.geschenk). Der Code
// lebt nur im State und auf dem Papier - nie in einer Adresse (der QR-Code trägt ihn nur hinter der Raute). Reine Daten.

export const GESCHENK_TITEL = 'Ein Geschenk für euch und euer Tier'
export const GESCHENK_UNTERZEILE = 'Ein eigenes Familienalbum für eure Erinnerungen'
export const GESCHENK_SCHRITTE = Object.freeze([
  'QR-Code scannen oder Adresse öffnen',
  'Code eingeben',
  'Euer Tier eintragen – fertig'
])
export const GESCHENK_FUSS = 'Heute kostenlos. Keine fremde Werbung, kein Tracking, kein Datenhandel.'

// Muster-Code für Demo und Vorschau ("DEMO-MUST-0001") - lässt sich nie einlösen.
export const GESCHENK_MUSTER_CODE = musterCodes(1)[0]

// Familienkarte auf A4 (Millimeter, viewBox des Bogens): Vorder- und Rückseite je A6 quer (148 × 105) übereinander,
// mittig - zusammen 148 × 210, in der Mitte gefaltet.
export const GESCHENK_KARTE_MM = Object.freeze({ width: 148, height: 105 })
export const GESCHENK_BOGEN_MM = Object.freeze({ left: 31, top: 43.5, width: 148, height: 210 })
const MARK_GAP_MM = 2
const MARK_LENGTH_MM = 6

// Schnittmarken außen an den vier Ecken und an der Falzlinie (links und rechts) - nie im Bild.
export function geschenkCropMarks() {
  const { left, top, width, height } = GESCHENK_BOGEN_MM
  const right = left + width
  const ys = [top, top + height / 2, top + height]
  const bottom = top + height
  const vertical = [left, right].flatMap((x) => [
    { x1: x, y1: top - MARK_GAP_MM - MARK_LENGTH_MM, x2: x, y2: top - MARK_GAP_MM },
    { x1: x, y1: bottom + MARK_GAP_MM, x2: x, y2: bottom + MARK_GAP_MM + MARK_LENGTH_MM }
  ])
  const horizontal = ys.flatMap((y) => [
    { x1: left - MARK_GAP_MM - MARK_LENGTH_MM, y1: y, x2: left - MARK_GAP_MM, y2: y },
    { x1: right + MARK_GAP_MM, y1: y, x2: right + MARK_GAP_MM + MARK_LENGTH_MM, y2: y }
  ])
  return [...vertical, ...horizontal]
}

// Lässt sich dieser Code als Geschenkkarte drucken? Nur offene Einladungscodes mit lesbarem Code - keine Besuchs-Codes
// (die gelten nur 7 Tage) und keine eingelösten.
export function canPrintGift(voucher) {
  return Boolean(voucher && voucher.code && voucher.status === 'offen' && !voucher.besuch && !voucher.codeFehler)
}
