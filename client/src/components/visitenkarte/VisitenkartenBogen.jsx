import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import VisitenkarteBack from './VisitenkarteBack.jsx'
import VisitenkarteFront from './VisitenkarteFront.jsx'
import { cropMarks } from '../../lib/visitenkarte.js'

// A4-Bögen für den Visitenkarten-Druck (Phase V5): je Bogen 10 Karten (2 × 5) mittig mit Schnittmarken, die Vorderseiten
// in Leserichtung, die Rückseiten in gespiegelter Spaltenfolge (lib/visitenkarte.js buildSheets) - so liegt beim
// beidseitigen Druck jede Rückseite hinter ihrer Karte. Dieselben Bögen zeigt die Seite verkleinert als Druckvorschau und
// druckt sie über VisitenkartenDruck: der hängt sie direkt in <body>, solange die Seite offen ist - beim Drucken blendet
// styles/visitenkarten.css die App (#root) aus, so entstehen keine Leerseiten (wie die Collage, collage/PrintSheet.jsx).
// Einladungskarten (EinladungskartenDesigner) drucken nach Kartenzahl: ein leerer Platz (null aus lib/einladungskarte.js
// buildKartenSheets) bleibt leer, und renderBack zeichnet ihre Rückseite (EinladungBack) statt der Visitenkarten-Rückseite.

export const VK_PRINT_BODY_CLASS = 'has-visitenkarten-print'
export const SEITEN = Object.freeze({ beide: 'beide', vorne: 'vorne', hinten: 'hinten' })

const MARKS = cropMarks()
const SIDE_LABELS = { vorne: 'Vorderseite', hinten: 'Rückseite' }

function CropMarks() {
  return (
    <svg className="vk-cropmarks" viewBox="0 0 210 297" aria-hidden="true">
      {MARKS.map((mark) => (
        <line key={`${mark.x1}-${mark.y1}-${mark.x2}-${mark.y2}`} {...mark} />
      ))}
    </svg>
  )
}

function EmptySlot() {
  return <span className="vk-slot-leer" aria-hidden="true" />
}

function Sheet({ sheet, side, total, card, muster, renderBack }) {
  const label = `Bogen ${sheet.number} von ${total}, ${SIDE_LABELS[side]}`
  return (
    <section className={`vk-sheet vk-sheet-${side}`} aria-label={label} data-seite={side}>
      <CropMarks />
      <span className="vk-sheet-label" aria-hidden="true">
        Bogen {sheet.number}/{total} · {SIDE_LABELS[side]}
      </span>
      <div className="vk-sheet-grid">
        {side === SEITEN.vorne
          ? sheet.fronts.map((index, slot) =>
              index === null ? <EmptySlot key={`leer-${slot}`} /> : <VisitenkarteFront key={index} card={card} />
            )
          : sheet.backs.map((back, slot) =>
              back === null ? (
                <EmptySlot key={`leer-${slot}`} />
              ) : (
                <Back key={back.index} back={back} card={card} muster={muster} renderBack={renderBack} />
              )
            )}
      </div>
    </section>
  )
}

function Back({ back, card, muster, renderBack }) {
  if (renderBack) return renderBack(back)
  return <VisitenkarteBack card={card} code={back.code} muster={muster && Boolean(back.code)} />
}

// seiten: beide (je Bogen Vorder- und gleich danach Rückseite - für Drucker mit Duplex), nur vorne oder nur hinten (zum
// Wenden von Hand: erst alle Vorderseiten, Stapel umdrehen, dann alle Rückseiten).
// total: Zahl aller Bögen (die Druckvorschau zeigt nur den ersten). renderBack(back): eigene Rückseite ({ index, code }).
export default function VisitenkartenBoegen({ sheets, card, seiten = SEITEN.beide, muster = false, total = sheets.length, renderBack = null }) {
  const sides = seiten === SEITEN.beide ? [SEITEN.vorne, SEITEN.hinten] : [seiten]
  return (
    <div className="vk-sheets">
      {sheets.flatMap((sheet) =>
        sides.map((side) => <Sheet key={`${sheet.number}-${side}`} sheet={sheet} side={side} total={total} card={card} muster={muster} renderBack={renderBack} />)
      )}
    </div>
  )
}

// Die Druckfassung: unsichtbar am Bildschirm, beim Drucken das Einzige auf dem Papier.
export function VisitenkartenDruck({ children }) {
  useEffect(() => {
    document.body.classList.add(VK_PRINT_BODY_CLASS)
    return () => document.body.classList.remove(VK_PRINT_BODY_CLASS)
  }, [])
  return createPortal(<div className="vk-print">{children}</div>, document.body)
}
