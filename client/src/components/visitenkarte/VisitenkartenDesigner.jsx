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
import { useIsAdminView, useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { needsPublicUrl } from '../../lib/voucherPrint.js'
import { CARDS_PER_SHEET, buildSheets, cardModel, designPayload, isSameDesign, musterCodes } from '../../lib/visitenkarte.js'

// Der Designer (Phase V5): links bzw. oben die Vorschau (Vorder- und Rückseite in echten Proportionen), daneben Gestaltung,
// Kunden-Gutschein und Drucken, darunter der erste A4-Bogen als Druckvorschau. Gedruckt wird die Druckfassung aus
// VisitenkartenDruck (direkt in <body>). Die Gutschein-Codes leben nur im State und im DOM der Karten - keine URL, kein
// localStorage, keine Konsole. Demo und Admin-Ansicht: alles ausprobieren und Muster drucken, nichts speichern.

const BLOCKED_HINT = 'Erst die Gutscheine holen – dann drucken.'

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
  const [gutscheine, setGutscheine] = useState(initial.gutscheine)
  const [sheets, setSheets] = useState(1)
  const [seiten, setSeiten] = useState(SEITEN.beide)
  const [codes, setCodes] = useState([])
  const [nurUngedruckt, setNurUngedruckt] = useState(true)
  const [busy, setBusy] = useState(false)
  const [codeError, setCodeError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const card = cardModel({ profile, design, publicUrl, origin: window.location.origin, demo: readOnly && !isAdminView })
  const cards = sheets * CARDS_PER_SHEET
  const printCodes = !design.mitGutschein ? [] : readOnly ? musterCodes(cards) : codes
  const sheetList = buildSheets({ sheetCount: sheets, codes: printCodes })
  const previewMuster = design.mitGutschein && (readOnly || codes.length === 0)
  const previewCode = design.mitGutschein ? printCodes[0] ?? musterCodes(1)[0] : null
  const blockedHint = design.mitGutschein && !readOnly && codes.length === 0 && gutscheine.offen > 0 ? BLOCKED_HINT : null
  const dirty = !isSameDesign(design, saved)

  const update = (patch) => setDesign((current) => ({ ...current, ...patch }))

  async function save() {
    setSaveError(null)
    setSaving(true)
    try {
      const result = await api.partnerArea.saveVisitenkarte(designPayload(design))
      setSaved(result.design)
      setDesign(result.design)
      setGutscheine(result.gutscheine)
      toast('Gestaltung gespeichert.')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function holen() {
    setCodeError(null)
    setBusy(true)
    try {
      const result = await api.partnerArea.visitenkarteGutscheine({ anzahl: Math.max(1, cards - codes.length), nurUngedruckt })
      setCodes((current) => [...new Set([...current, ...result.codes])])
      setGutscheine(result.gutscheine)
    } catch (err) {
      setCodeError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="vk-designer">
        <div className="vk-stage-col">
          <Stage card={card} code={previewCode} muster={previewMuster} />
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
            gutscheine={gutscheine}
            cards={cards}
            codes={codes}
            nurUngedruckt={nurUngedruckt}
            onNurUngedruckt={setNurUngedruckt}
            busy={busy}
            error={codeError}
            onHolen={holen}
          />
          <VisitenkarteDruckOptionen
            sheets={sheets}
            onSheets={setSheets}
            seiten={seiten}
            onSeiten={setSeiten}
            blockedHint={blockedHint}
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
        </p>
        <VisitenkartenBoegen sheets={sheetList.slice(0, 1)} total={sheetList.length} card={card} muster={readOnly} />
      </section>

      <VisitenkartenDruck>
        <VisitenkartenBoegen sheets={sheetList} card={card} seiten={seiten} muster={readOnly} />
      </VisitenkartenDruck>
    </>
  )
}
