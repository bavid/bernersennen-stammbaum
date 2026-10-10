import { useEffect, useState } from 'react'
import { api } from '../../api'
import EinladungBack from './EinladungBack.jsx'
import KartenCodes from './KartenCodes.jsx'
import KartenDruckOptionen from './KartenDruckOptionen.jsx'
import KartenWahl from './KartenWahl.jsx'
import KombiBack from './KombiBack.jsx'
import VisitenkarteBack from './VisitenkarteBack.jsx'
import VisitenkarteFarbe from './VisitenkarteFarbe.jsx'
import VisitenkarteFront from './VisitenkarteFront.jsx'
import VisitenkarteInhalt from './VisitenkarteInhalt.jsx'
import VisitenkarteVorlagen from './VisitenkarteVorlagen.jsx'
import VisitenkartenBoegen, { SEITEN, VisitenkartenDruck } from './VisitenkartenBogen.jsx'
import { AddressPendingNote, BogenVorschau, SaveRow, Stage } from './VisitenkartenTeile.jsx'
import useKartenEntwurf from '../../hooks/useKartenEntwurf.js'
import useVisitenkartenDruck from '../../hooks/useVisitenkartenDruck.js'
import { useIsAdminView, useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { printAddressPending } from '../../lib/voucherPrint.js'
import { CARDS_PER_SHEET, cardModel, designPayload, isSameDesign, maskPendingAddress, musterCodes, normalizeDesign } from '../../lib/visitenkarte.js'
import { DEFAULT_KARTEN, buildKartenSheets, rueckseiteModel, sheetCountFor } from '../../lib/einladungskarte.js'
import { KARTE, backHasCode } from '../../lib/kartenWahl.js'
import { t } from '../../lib/i18n/index.js'

// Der Karten-Designer (Phase V5, Feedback-Runde: eine Seite ohne "Kartenart"): oben die Wahl der Kombination (KartenWahl
// - Visitenkarte, Einladungskarte oder Kombi), daneben bzw. darunter die Vorschau (Vorder- und Rückseite in echten
// Proportionen), die EINE Vorderseite (Vorlage, Farbe, Inhalt mit persönlicher Zeile - für jede Kombination dieselbe),
// die Einladungscodes (nur bei einer Rückseite mit Code) und Drucken; der Druckbogen zum Aufklappen. Gestaltung und
// Kombination speichert "Gestaltung speichern" gemeinsam (hooks/useKartenEntwurf.js, PUT /visitenkarte). Echte Codes holt
// erst "Drucken" (hooks/useVisitenkartenDruck.js) und nur für diesen einen Druck - in genau der Zahl der Karten, die Codes
// bekommen (ohne Code keine Karte mit Code-Rückseite). Bis dahin zeigen Vorschau und Druckbogen Muster-Codes, und die
// Druckfassung trägt nur Vorderseiten. Die Codes leben nur im State und im DOM der Druckfassung: keine URL, kein
// localStorage, keine Konsole. Demo und Admin-Ansicht: alles ausprobieren und Muster drucken, nichts speichern, nie echte
// Codes. Ohne öffentliche Adresse (nur Produktion) wartet der Druck: ein Satz statt einer Adresse, keine Druckfassung.

export const RUECKSEITE_NOTE = 'Die Rückseite gestaltet Familie auf Pfoten.'
const CODES_LATER = 'Die echten Codes kommen erst beim Drucken der Rückseiten dazu.'

function BackOf({ karte, card, back, code, muster }) {
  if (karte === KARTE.einladung) return <EinladungBack card={card} rueckseite={back} code={code} muster={muster} />
  if (karte === KARTE.kombi) return <KombiBack card={card} rueckseite={back} code={code} muster={muster} />
  return <VisitenkarteBack card={card} />
}

// Was in der Druckfassung steht: Muster (Demo/Admin-Ansicht), ohne Code-Rückseite einfach alle Karten, nach dem Abruf
// genau die Karten mit Code, davor nur Vorderseiten (für "Nur vorne" und solange noch kein Code geholt ist).
function printSheetsFor({ readOnly, hasCode, count, printable, printCodes, muster, seiten }) {
  if (readOnly) return { sheets: buildKartenSheets({ count, codes: hasCode ? muster : [] }), seiten }
  if (!hasCode) return { sheets: buildKartenSheets({ count, codes: [] }), seiten }
  if (printCodes.length > 0) return { sheets: buildKartenSheets({ count: printCodes.length, codes: printCodes }), seiten }
  return { sheets: buildKartenSheets({ count: printable, codes: [] }), seiten: SEITEN.vorne }
}

// karte: die Kombination aus der Adresse (null: die gespeicherte); onKarte(id) schreibt die Wahl in die Adresse.
export default function KartenDesigner({ karte: karteParam, onKarte, profile, initial, publicUrl, appEnv }) {
  const readOnly = useIsDemo()
  const isAdminView = useIsAdminView()
  const readOnlyHint = useReadOnlyHint()
  const druck = useVisitenkartenDruck(initial.gutscheine)
  const entwurf = useKartenEntwurf({
    initial: normalizeDesign(initial.design),
    gespeichert: initial.gespeichert,
    override: karteParam ? { karte: karteParam } : null,
    toPayload: designPayload,
    isSame: isSameDesign,
    request: (payload) => api.partnerArea.saveVisitenkarte(payload),
    pick: (result) => result.design,
    onSaved: (result) => druck.setGutscheine(result.gutscheine)
  })
  const { design, update } = entwurf
  const [count, setCount] = useState(DEFAULT_KARTEN)
  const [seiten, setSeiten] = useState(SEITEN.beide)

  // Zurück/Vor im Browser ändert ?karte= - der Entwurf zieht nach.
  useEffect(() => {
    if (karteParam && karteParam !== design.karte) update({ karte: karteParam })
    // Nur auf die Adresse reagieren - eine Wahl per Kachel setzt beides selbst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteParam])

  const karte = design.karte
  const hasCode = backHasCode(karte)
  const addressPending = printAddressPending({ appEnv, publicUrl, readOnly })
  const baseCard = cardModel({ profile, design, publicUrl, origin: window.location.origin, demo: readOnly && !isAdminView })
  const card = addressPending ? maskPendingAddress(baseCard) : baseCard
  const back = rueckseiteModel(initial.rueckseite, card)
  const muster = musterCodes(count)
  const printable = readOnly || !hasCode ? count : Math.min(count, druck.available)
  const withCodes = hasCode && !readOnly && seiten !== SEITEN.vorne
  const druckfassung = printSheetsFor({ readOnly, hasCode, count, printable, printCodes: druck.printCodes, muster, seiten })
  const renderBack = (isMuster) => (entry) => <BackOf karte={karte} card={card} back={back} code={entry.code} muster={isMuster} />

  function chooseKarte(next) {
    update({ karte: next })
    onKarte(next)
  }

  return (
    <>
      <KartenWahl karte={karte} onChange={chooseKarte} disabled={druck.busy} />
      <div className={`vk-designer${hasCode ? ' has-codes' : ''}`}>
        <div className="vk-stage-col">
          <Stage
            front={<VisitenkarteFront card={card} />}
            back={<BackOf karte={karte} card={card} back={back} code={muster[0]} muster />}
            backNote={hasCode ? t(RUECKSEITE_NOTE) : null}
          />
        </div>
        <section className="vk-panel vk-area-front" aria-labelledby="vk-gestaltung-title">
          <h2 id="vk-gestaltung-title" className="vk-panel-title">
            {t('Vorderseite')}
          </h2>
          <VisitenkarteVorlagen value={design.vorlage} farbe={design.farbe} hasFoto={Boolean(card.fotoUrl)} onChange={(vorlage) => update({ vorlage })} />
          <VisitenkarteFarbe value={design.farbe} eigeneFarbe={profile.farbe} onChange={(farbe) => update({ farbe })} />
          <VisitenkarteInhalt design={design} profile={profile} vorschlag={initial.vorschlag} onChange={update} />
          <SaveRow entwurf={entwurf} readOnly={readOnly} readOnlyHint={readOnlyHint} />
        </section>
        {hasCode && (
          <div className="vk-area-codes">
            <KartenCodes readOnly={readOnly} isAdminView={isAdminView} druck={druck} count={count} />
          </div>
        )}
        <div className="vk-area-druck">
          <KartenDruckOptionen
            count={count}
            onCount={setCount}
            seiten={seiten}
            onSeiten={setSeiten}
            onPrint={() => druck.print({ withCodes, cards: printable })}
            busy={druck.busy}
            printable={printable}
            withCodes={withCodes}
            addressNote={addressPending ? <AddressPendingNote /> : null}
          />
        </div>
      </div>

      <BogenVorschau note={hasCode && !readOnly ? t(CODES_LATER) : null}>
        <VisitenkartenBoegen
          sheets={buildKartenSheets({ count: Math.min(count, CARDS_PER_SHEET), codes: hasCode ? muster : [] })}
          total={sheetCountFor(count)}
          card={card}
          renderBack={renderBack(true)}
        />
      </BogenVorschau>

      {!addressPending && (
        <VisitenkartenDruck>
          <VisitenkartenBoegen sheets={druckfassung.sheets} card={card} seiten={druckfassung.seiten} renderBack={renderBack(readOnly)} />
        </VisitenkartenDruck>
      )}
    </>
  )
}
