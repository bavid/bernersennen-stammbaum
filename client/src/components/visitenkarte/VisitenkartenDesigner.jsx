import { useState } from 'react'
import VisitenkarteBack from './VisitenkarteBack.jsx'
import VisitenkarteDruckOptionen from './VisitenkarteDruckOptionen.jsx'
import VisitenkarteFarbe from './VisitenkarteFarbe.jsx'
import VisitenkarteFront from './VisitenkarteFront.jsx'
import VisitenkarteGutschein from './VisitenkarteGutschein.jsx'
import VisitenkarteInhalt from './VisitenkarteInhalt.jsx'
import VisitenkarteVorlagen from './VisitenkarteVorlagen.jsx'
import VisitenkartenBoegen, { SEITEN, VisitenkartenDruck } from './VisitenkartenBogen.jsx'
import { PublicUrlWarning, SaveRow, Stage } from './VisitenkartenTeile.jsx'
import { useIsAdminView, useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { needsPublicUrl } from '../../lib/voucherPrint.js'
import { CARDS_PER_SHEET, buildSheets, cardModel, musterCodes } from '../../lib/visitenkarte.js'

// Der Visitenkarten-Designer (Phase V5): links bzw. oben die Vorschau (Vorder- und Rückseite in echten Proportionen),
// daneben Gestaltung, Kunden-Gutschein und Drucken, darunter der erste A4-Bogen als Druckvorschau. Gedruckt wird die
// Druckfassung aus VisitenkartenDruck (direkt in <body>). Echte Gutschein-Codes holt erst "Drucken"
// (hooks/useVisitenkartenDruck.js, druck) und nur für diesen einen Druck - Vorschau und Druckbogen zeigen bis dahin
// Muster-Codes. Die Codes leben nur im State und im DOM der Druckfassung: keine URL, kein localStorage, keine Konsole.
// Demo und Admin-Ansicht: alles ausprobieren und Muster drucken, nichts speichern. Gestaltung und Speichern kommen als
// entwurf (hooks/useKartenEntwurf.js) aus KartenDesigner.jsx - so übersteht sie einen Wechsel zur Einladungskarte.
export default function VisitenkartenDesigner({ profile, vorschlag, publicUrl, entwurf, druck }) {
  const readOnly = useIsDemo()
  const isAdminView = useIsAdminView()
  const readOnlyHint = useReadOnlyHint()
  const [sheets, setSheets] = useState(1)
  const [seiten, setSeiten] = useState(SEITEN.beide)
  const { design, update } = entwurf

  const card = cardModel({ profile, design, publicUrl, origin: window.location.origin, demo: readOnly && !isAdminView })
  const cards = sheets * CARDS_PER_SHEET
  // Echte Codes nur im eigenen Bereich, nur wenn welche verfügbar sind (sonst bekommen die Karten die Portal-Rückseite) und
  // nur, wenn dieser Druck Rückseiten enthält - "Nur vorne" holt keine Codes, die nie aufs Papier kämen.
  const showsMuster = design.mitGutschein && (readOnly || druck.available > 0)
  const withCodes = showsMuster && !readOnly && seiten !== SEITEN.vorne
  const muster = showsMuster ? musterCodes(cards) : []
  const printCodes = readOnly ? muster : design.mitGutschein ? druck.printCodes : []

  return (
    <>
      <div className="vk-designer">
        <div className="vk-stage-col">
          <Stage
            front={<VisitenkarteFront card={card} />}
            back={<VisitenkarteBack card={card} code={showsMuster ? muster[0] : null} muster={showsMuster} />}
          />
        </div>
        <div className="vk-controls">
          <section className="vk-panel" aria-labelledby="vk-gestaltung-title">
            <h2 id="vk-gestaltung-title" className="vk-panel-title">
              Gestaltung
            </h2>
            <VisitenkarteVorlagen
              value={design.vorlage}
              farbe={design.farbe}
              hasFoto={Boolean(card.fotoUrl)}
              onChange={(vorlage) => update({ vorlage })}
            />
            <VisitenkarteFarbe value={design.farbe} eigeneFarbe={profile.farbe} onChange={(farbe) => update({ farbe })} />
            <VisitenkarteInhalt design={design} profile={profile} vorschlag={vorschlag} onChange={update} />
            <SaveRow entwurf={entwurf} readOnly={readOnly} readOnlyHint={readOnlyHint} />
          </section>
          <VisitenkarteGutschein
            checked={design.mitGutschein}
            onToggle={(mitGutschein) => update({ mitGutschein })}
            readOnly={readOnly}
            isAdminView={isAdminView}
            druck={druck}
            cards={cards}
          />
          <VisitenkarteDruckOptionen
            sheets={sheets}
            onSheets={setSheets}
            seiten={seiten}
            onSeiten={setSeiten}
            onPrint={() => druck.print({ withCodes, cards })}
            busy={druck.busy}
            gutscheinAnzahl={withCodes ? Math.min(cards, druck.available) : 0}
            publicUrlWarning={needsPublicUrl(publicUrl) ? <PublicUrlWarning baseUrl={card.baseUrl} /> : null}
          />
        </div>
      </div>

      <section className="vk-bogen-vorschau" aria-labelledby="vk-bogen-title">
        <h2 id="vk-bogen-title" className="vk-panel-title">
          Druckbogen
        </h2>
        <p className="muted">
          So kommt Bogen 1 aufs Papier – Vorderseite und die gespiegelte Rückseite.
          {sheets > 1 && ` Dazu ${sheets - 1} weitere ${sheets - 1 === 1 ? 'Bogen' : 'Bögen'}.`}
          {showsMuster && !readOnly && ' Die echten Codes kommen erst beim Drucken der Rückseiten dazu.'}
        </p>
        <VisitenkartenBoegen sheets={buildSheets({ sheetCount: 1, codes: muster })} total={sheets} card={card} muster />
      </section>

      <VisitenkartenDruck>
        <VisitenkartenBoegen sheets={buildSheets({ sheetCount: sheets, codes: printCodes })} card={card} seiten={seiten} muster={readOnly} />
      </VisitenkartenDruck>
    </>
  )
}
