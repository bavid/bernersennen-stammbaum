import { useState } from 'react'
import EinladungBack from './EinladungBack.jsx'
import EinladungCodes from './EinladungCodes.jsx'
import EinladungDruckOptionen from './EinladungDruckOptionen.jsx'
import VisitenkarteFarbe from './VisitenkarteFarbe.jsx'
import VisitenkarteFront from './VisitenkarteFront.jsx'
import VisitenkarteInhalt from './VisitenkarteInhalt.jsx'
import VisitenkarteVorlagen from './VisitenkarteVorlagen.jsx'
import VisitenkartenBoegen, { SEITEN, VisitenkartenDruck } from './VisitenkartenBogen.jsx'
import { PublicUrlWarning, SaveRow, Stage } from './VisitenkartenTeile.jsx'
import { useIsAdminView, useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { needsPublicUrl } from '../../lib/voucherPrint.js'
import { CARDS_PER_SHEET, musterCodes } from '../../lib/visitenkarte.js'
import { ART, DEFAULT_KARTEN, buildKartenSheets, einladungCardModel, rueckseiteModel, sheetCountFor } from '../../lib/einladungskarte.js'

// Der Einladungskarten-Designer (Wunsch des Betreibers: "Vorderseite ihre Infos, Rückseite meine Infos"): vorne gestaltet
// der Partner wie bei der Visitenkarte (Vorlage, Farbe, Inhalt, dazu eine persönliche Zeile), hinten steht die Seite von
// Familie auf Pfoten (rueckseite: die Admin-Einstellung, hier nur zu sehen) mit einem eigenen Code je Karte. Die Codes
// holt erst "Drucken" - derselbe Abruf wie bei den Visitenkarten (druck, hooks/useVisitenkartenDruck.js): in genau der
// Zahl der Karten, die wirklich Codes bekommen (ohne Code keine Karte). Bis dahin zeigen Vorschau und Druckbogen
// Muster-Codes, und die Druckfassung trägt nur Vorderseiten - "Nur vorne" holt keine Codes. Demo und Admin-Ansicht:
// ausprobieren und Muster drucken, nichts speichern, nie echte Codes.

export const RUECKSEITE_NOTE = 'Die Rückseite gestaltet Familie auf Pfoten.'

// Was in der Druckfassung steht: Muster (Demo/Admin-Ansicht), nach dem Abruf genau die Karten mit Code, davor nur
// Vorderseiten (für "Nur vorne" und solange noch kein Code geholt ist).
function printSheetsFor({ readOnly, count, printable, printCodes, muster, seiten }) {
  if (readOnly) return { sheets: buildKartenSheets({ count, codes: muster }), seiten }
  if (printCodes.length > 0) return { sheets: buildKartenSheets({ count: printCodes.length, codes: printCodes }), seiten }
  return { sheets: buildKartenSheets({ count: printable, codes: [] }), seiten: SEITEN.vorne }
}

export default function EinladungskartenDesigner({ profile, vorschlag, publicUrl, rueckseite, entwurf, druck }) {
  const readOnly = useIsDemo()
  const isAdminView = useIsAdminView()
  const readOnlyHint = useReadOnlyHint()
  const [count, setCount] = useState(DEFAULT_KARTEN)
  const [seiten, setSeiten] = useState(SEITEN.beide)
  const { design, update } = entwurf

  const card = einladungCardModel({ profile, design, publicUrl, origin: window.location.origin })
  const back = rueckseiteModel(rueckseite, card)
  const printable = readOnly ? count : Math.min(count, druck.available)
  const muster = musterCodes(count)
  const withCodes = !readOnly && seiten !== SEITEN.vorne
  const druckfassung = printSheetsFor({ readOnly, count, printable, printCodes: druck.printCodes, muster, seiten })
  const renderBack = (isMuster) => (entry) => <EinladungBack card={card} rueckseite={back} code={entry.code} muster={isMuster} />

  return (
    <>
      <div className="vk-designer">
        <div className="vk-stage-col">
          <Stage
            front={<VisitenkarteFront card={card} />}
            back={<EinladungBack card={card} rueckseite={back} code={muster[0]} muster />}
            backNote={RUECKSEITE_NOTE}
          />
        </div>
        <div className="vk-controls">
          <section className="vk-panel" aria-labelledby="vk-gestaltung-title">
            <h2 id="vk-gestaltung-title" className="vk-panel-title">
              Vorderseite
            </h2>
            <VisitenkarteVorlagen
              value={design.vorlage}
              farbe={design.farbe}
              hasFoto={Boolean(card.fotoUrl)}
              onChange={(vorlage) => update({ vorlage })}
            />
            <VisitenkarteFarbe value={design.farbe} eigeneFarbe={profile.farbe} onChange={(farbe) => update({ farbe })} />
            <VisitenkarteInhalt design={design} profile={profile} vorschlag={vorschlag} onChange={update} mitWidmung />
            <SaveRow entwurf={entwurf} readOnly={readOnly} readOnlyHint={readOnlyHint} />
          </section>
          <EinladungCodes readOnly={readOnly} isAdminView={isAdminView} druck={druck} count={count} />
          <EinladungDruckOptionen
            count={count}
            onCount={setCount}
            seiten={seiten}
            onSeiten={setSeiten}
            onPrint={() => druck.print({ withCodes, cards: printable, art: ART.einladung, nurMitCodes: true })}
            busy={druck.busy}
            printable={printable}
            publicUrlWarning={needsPublicUrl(publicUrl) ? <PublicUrlWarning baseUrl={card.baseUrl} /> : null}
          />
        </div>
      </div>

      <section className="vk-bogen-vorschau" aria-labelledby="vk-bogen-title">
        <h2 id="vk-bogen-title" className="vk-panel-title">
          Druckbogen
        </h2>
        <p className="muted">
          So kommt Bogen 1 aufs Papier – vorne eure Seite, hinten die von Familie auf Pfoten, gespiegelt.
          {!readOnly && ' Die echten Codes kommen erst beim Drucken der Rückseiten dazu.'}
        </p>
        <VisitenkartenBoegen
          sheets={buildKartenSheets({ count: Math.min(count, CARDS_PER_SHEET), codes: muster })}
          total={sheetCountFor(count)}
          card={card}
          renderBack={renderBack(true)}
        />
      </section>

      <VisitenkartenDruck>
        <VisitenkartenBoegen sheets={druckfassung.sheets} card={card} seiten={druckfassung.seiten} renderBack={renderBack(readOnly)} />
      </VisitenkartenDruck>
    </>
  )
}
