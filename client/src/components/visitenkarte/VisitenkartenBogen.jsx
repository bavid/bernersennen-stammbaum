import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import VisitenkarteBack from './VisitenkarteBack.jsx'
import VisitenkarteFront from './VisitenkarteFront.jsx'
import { cropMarks } from '../../lib/visitenkarte.js'
import { t } from '../../lib/i18n/index.js'

// A4-Bögen für den Karten-Druck (Phase V5): je Bogen bis zu 10 Karten (2 × 5) mittig mit Schnittmarken, die Vorderseiten
// in Leserichtung, die Rückseiten in gespiegelter Spaltenfolge (lib/einladungskarte.js buildKartenSheets) - so liegt beim
// beidseitigen Druck jede Rückseite hinter ihrer Karte; ein leerer Platz auf dem letzten Bogen bleibt leer. Dieselben Bögen
// zeigt die Seite verkleinert als Druckvorschau und druckt sie über VisitenkartenDruck: der hängt sie direkt in <body>,
// solange die Seite offen ist - beim Drucken blendet styles/visitenkarten.css die App (#root) aus, so entstehen keine
// Leerseiten (wie die Collage, collage/PrintSheet.jsx). renderBack zeichnet die Rückseite der gewählten Kombination
// (KartenDesigner); ohne renderBack die Rückseite mit dem Portal.

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

function Sheet({ sheet, side, total, card, renderBack, renderFront }) {
  const sideLabel = t(SIDE_LABELS[side])
  const label = t('Bogen {n} von {total}, {side}', { n: sheet.number, total, side: sideLabel })
  return (
    <section className={`vk-sheet vk-sheet-${side}`} aria-label={label} data-seite={side}>
      <CropMarks />
      <span className="vk-sheet-label" aria-hidden="true">
        {t('Bogen {n}/{total} · {side}', { n: sheet.number, total, side: sideLabel })}
      </span>
      <div className="vk-sheet-grid">
        {side === SEITEN.vorne
          ? sheet.fronts.map((index, slot) =>
              index === null ? <EmptySlot key={`leer-${slot}`} /> : <Front key={index} card={card} renderFront={renderFront} />
            )
          : sheet.backs.map((back, slot) =>
              back === null ? (
                <EmptySlot key={`leer-${slot}`} />
              ) : (
                <Back key={back.index} back={back} card={card} renderBack={renderBack} />
              )
            )}
      </div>
    </section>
  )
}

function Front({ card, renderFront }) {
  if (renderFront) return renderFront()
  return <VisitenkarteFront card={card} />
}

function Back({ back, card, renderBack }) {
  if (renderBack) return renderBack(back)
  return <VisitenkarteBack card={card} />
}

// seiten: beide (je Bogen Vorder- und gleich danach Rückseite - für Drucker mit Duplex), nur vorne oder nur hinten (zum
// Wenden von Hand: erst alle Vorderseiten, Stapel umdrehen, dann alle Rückseiten).
// total: Zahl aller Bögen (die Druckvorschau zeigt nur den ersten). renderBack(back): eigene Rückseite ({ index, code }).
// renderFront(): eigene Vorderseite (Geschenkkarte), sonst die Visitenkarte.
export default function VisitenkartenBoegen({ sheets, card, seiten = SEITEN.beide, total = sheets.length, renderBack = null, renderFront = null }) {
  const sides = seiten === SEITEN.beide ? [SEITEN.vorne, SEITEN.hinten] : [seiten]
  return (
    <div className="vk-sheets">
      {sheets.flatMap((sheet) =>
        sides.map((side) => <Sheet key={`${sheet.number}-${side}`} sheet={sheet} side={side} total={total} card={card} renderBack={renderBack} renderFront={renderFront} />)
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
