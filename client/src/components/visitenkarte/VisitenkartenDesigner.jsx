import { useState } from 'react'
import { api } from '../../api'
import Icon from '../Icon.jsx'
import { useToast } from '../Toast.jsx'
import VisitenkarteBack from './VisitenkarteBack.jsx'
import VisitenkarteDruckOptionen from './VisitenkarteDruckOptionen.jsx'
import VisitenkarteFarbe from './VisitenkarteFarbe.jsx'
import VisitenkarteFront from './VisitenkarteFront.jsx'
import VisitenkarteGutschein from './VisitenkarteGutschein.jsx'
import VisitenkarteInhalt from './VisitenkarteInhalt.jsx'
import VisitenkarteVorlagen from './VisitenkarteVorlagen.jsx'
import VisitenkartenBoegen, { SEITEN, VisitenkartenDruck } from './VisitenkartenBogen.jsx'
import useVisitenkartenDruck from '../../hooks/useVisitenkartenDruck.js'
import { useIsAdminView, useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { needsPublicUrl } from '../../lib/voucherPrint.js'
import { CARDS_PER_SHEET, buildSheets, cardModel, designPayload, isSameDesign, musterCodes } from '../../lib/visitenkarte.js'

// Der Designer (Phase V5): links bzw. oben die Vorschau (Vorder- und Rückseite in echten Proportionen), daneben Gestaltung,
// Kunden-Gutschein und Drucken, darunter der erste A4-Bogen als Druckvorschau. Gedruckt wird die Druckfassung aus
// VisitenkartenDruck (direkt in <body>). Echte Gutschein-Codes holt erst "Drucken" (hooks/useVisitenkartenDruck.js) und
// nur für diesen einen Druck - Vorschau und Druckbogen zeigen bis dahin Muster-Codes. Die Codes leben nur im State und
// im DOM der Druckfassung: keine URL, kein localStorage, keine Konsole. Demo und Admin-Ansicht: alles ausprobieren und
// Muster drucken, nichts speichern.

function PublicUrlWarning({ baseUrl }) {
  return (
    <p className="vk-note is-warning" role="note">
      <Icon name="alert" /> Die QR-Codes zeigen auf {baseUrl} – keine öffentliche Adresse. Bitte vor dem Druck beim Betreiber melden.
    </p>
  )
}

function SaveRow({ dirty, saving, readOnly, readOnlyHint, error, onSave }) {
  return (
    <div className="vk-save-row">
      <button type="button" className="btn btn-primary" onClick={onSave} disabled={readOnly || saving || !dirty}>
        <Icon name="check" /> {saving ? 'Speichere …' : 'Gestaltung speichern'}
      </button>
      {readOnly ? (
        <span className="field-hint">{readOnlyHint}</span>
      ) : (
        <span className={`field-hint ${dirty ? 'vk-dirty' : ''}`}>{dirty ? 'Noch nicht gespeichert' : 'Gespeichert'}</span>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function Stage({ card, code, muster }) {
  return (
    <section className="vk-stage" aria-labelledby="vk-vorschau-title">
      <div className="vk-stage-head">
        <h2 id="vk-vorschau-title" className="vk-panel-title">
          Vorschau
        </h2>
        <span className="muted">85 × 55 mm</span>
      </div>
      <div className="vk-stage-cards">
        <figure className="vk-stage-card">
          <VisitenkarteFront card={card} />
          <figcaption>Vorderseite</figcaption>
        </figure>
        <figure className="vk-stage-card">
          <VisitenkarteBack card={card} code={code} muster={muster} />
          <figcaption>Rückseite</figcaption>
        </figure>
      </div>
    </section>
  )
}

export default function VisitenkartenDesigner({ profile, initial, publicUrl }) {
  const toast = useToast()
  const readOnly = useIsDemo()
  const isAdminView = useIsAdminView()
  const readOnlyHint = useReadOnlyHint()
  const [design, setDesign] = useState(initial.design)
  const [saved, setSaved] = useState(initial.gespeichert ? initial.design : null)
  const [sheets, setSheets] = useState(1)
  const [seiten, setSeiten] = useState(SEITEN.beide)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const druck = useVisitenkartenDruck(initial.gutscheine)

  const card = cardModel({ profile, design, publicUrl, origin: window.location.origin, demo: readOnly && !isAdminView })
  const cards = sheets * CARDS_PER_SHEET
  // Echte Codes nur im eigenen Bereich, nur wenn welche verfügbar sind (sonst bekommen die Karten die Portal-Rückseite) und
  // nur, wenn dieser Druck Rückseiten enthält - "Nur vorne" holt keine Codes, die nie aufs Papier kämen.
  const showsMuster = design.mitGutschein && (readOnly || druck.available > 0)
  const withCodes = showsMuster && !readOnly && seiten !== SEITEN.vorne
  const muster = showsMuster ? musterCodes(cards) : []
  const printCodes = readOnly ? muster : design.mitGutschein ? druck.printCodes : []
  const dirty = !isSameDesign(design, saved)

  const update = (patch) => setDesign((current) => ({ ...current, ...patch }))

  // Nur übernehmen, was gespeichert wurde: wer während des Speicherns weiter ändert, behält seine Änderungen (und sieht
  // "Noch nicht gespeichert").
  async function save() {
    const payload = designPayload(design)
    setSaveError(null)
    setSaving(true)
    try {
      const result = await api.partnerArea.saveVisitenkarte(payload)
      setSaved(result.design)
      setDesign((current) => (isSameDesign(current, payload) ? result.design : current))
      druck.setGutscheine(result.gutscheine)
      toast('Gestaltung gespeichert.')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="vk-designer">
        <div className="vk-stage-col">
          <Stage card={card} code={showsMuster ? muster[0] : null} muster={showsMuster} />
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
            <VisitenkarteInhalt design={design} profile={profile} vorschlag={initial.vorschlag} onChange={update} />
            <SaveRow dirty={dirty} saving={saving} readOnly={readOnly} readOnlyHint={readOnlyHint} error={saveError} onSave={save} />
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
