import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { downscaleImage } from '../lib/images.js'
import { ORDER_ERROR } from '../lib/reorder.js'
import {
  BANNER_ACCEPT,
  BANNER_LAYOUTS,
  BANNER_TYPE_MESSAGE,
  bannerFormData,
  editorSlots,
  isBannerFileType,
  layoutOf,
  layoutSlots,
  ownBannerItems,
  slotLabel
} from '../lib/partnerBanner.js'
import useDragReorder from '../hooks/useDragReorder.js'
import BannerLayoutPicker from './BannerLayoutPicker.jsx'
import Icon from './Icon.jsx'
import PartnerBannerSlot from './PartnerBannerSlot.jsx'
import { useToast } from './Toast.jsx'
import { t } from '../lib/i18n/index.js'

const TITLE_ID = 'partner-banner-title'
const HINT_ID = 'partner-banner-hint'
const REORDER_HINT = 'Reihenfolge ändern: ein Foto am Griff ziehen – oder den Griff mit der Leertaste aufnehmen und mit den Pfeiltasten bewegen.'

function layoutLabel(id) {
  return BANNER_LAYOUTS.find((layout) => layout.id === id)?.label ?? ''
}

// Der freie Platz im Layout: "Foto hinzufügen" lädt sofort hoch (an die nächste freie Stelle - Fotos rücken lückenlos).
function AddSlot({ label, busy, locked, onFile }) {
  return (
    <li className="partner-banner-slot is-empty">
      <span className="partner-banner-thumb partner-banner-placeholder" aria-hidden="true">
        <Icon name="camera" />
      </span>
      <div className="partner-banner-slot-body">
        <span className="partner-banner-slot-label">{label}</span>
        <label className={`btn btn-ghost btn-compact admin-upload-btn${locked ? ' is-disabled' : ''}`}>
          <Icon name={busy ? 'clock' : 'plus'} />
          {busy ? t('Lädt …') : t('Foto hinzufügen')}
          <input
            type="file"
            accept={BANNER_ACCEPT}
            onChange={onFile}
            disabled={locked}
            className="admin-upload-input"
            aria-label={t('{label} hinzufügen', { label })}
            aria-describedby={HINT_ID}
          />
        </label>
      </div>
    </li>
  )
}

// Reiter "Fotos" auf /profil (Phase V4b, Feedback-Runde): erst das Layout (BannerLayoutPicker - ein Foto, halb/halb,
// groß links oder drei), darunter je Platz des Layouts das Foto (PartnerBannerSlot: ersetzen, beschreiben, entfernen)
// bzw. der nächste freie Platz zum Hinzufügen. Fotos, die das gewählte Layout nicht zeigt, stehen darunter - sie bleiben
// gespeichert, bis man sie entfernt. banner/layout: aus GET /partner-area/profile (banner, bannerLayout);
// onChange({ banner, layout }) nach jeder Änderung. Demo und Admin-Ansicht: das Layout lässt sich ansehen und
// umschalten (ohne Speichern), alles andere ist gesperrt.
// Anordnen: jedes Foto hat einen Griff (ReorderHandle, hooks/useDragReorder.js) - ziehen oder per Tastatur, auch
// zwischen den Plätzen des Layouts und den Fotos darunter. Die neue Reihenfolge gilt sofort (pending, optimistisch) und
// geht als Liste der bisherigen Positionen an den Server; scheitert das, springt die alte zurück. In der Demo nur lokal.
export default function PartnerBannerEditor({ banner, layout, onChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [demoLayout, setDemoLayout] = useState(null)
  const [pending, setPending] = useState(null)
  const baseItems = pending ?? ownBannerItems(banner)
  const current = layoutOf(isDemo && demoLayout ? demoLayout : layout, baseItems.length)
  const reorder = useDragReorder({
    keys: baseItems.map((item) => item.fotoUrl),
    disabled: baseItems.length < 2,
    labelFor: (url) => positionLabel(baseItems.findIndex((item) => item.fotoUrl === url) + 1),
    onCommit: handleReorder
  })
  // Die Vorschau-Reihenfolge (Tastatur) bzw. die aktuelle - mit Positionen 1 … n in dieser Reihenfolge.
  const items = reorder.order.map((url, index) => ({ ...baseItems.find((item) => item.fotoUrl === url), position: index + 1 }))
  const { slots, extra } = editorSlots(current, items)
  const locked = isDemo || busy || pending !== null

  // Neue Daten vom Server lösen die optimistische Reihenfolge ab (in der Demo kommen keine - sie bleibt lokal).
  useEffect(() => {
    setPending(null)
  }, [banner])

  function positionLabel(position) {
    return position <= layoutSlots(current) ? slotLabel(current, position) : t('Foto {n}', { n: position })
  }

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleLayout(next) {
    if (isDemo) {
      setDemoLayout(next)
      return
    }
    run(() => api.partnerArea.setBannerLayout(next))
  }

  async function handleAdd(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isBannerFileType(file)) {
      setError(t(BANNER_TYPE_MESSAGE))
      return
    }
    run(async () => api.partnerArea.addBanner(bannerFormData(await downscaleImage(file))))
  }

  async function handleReorder(nextUrls) {
    const previous = baseItems
    const positions = nextUrls.map((url) => previous.find((item) => item.fotoUrl === url).position)
    setPending(nextUrls.map((url, index) => ({ ...previous.find((item) => item.fotoUrl === url), position: index + 1 })))
    if (isDemo) {
      toast(readOnlyHint)
      return
    }
    try {
      onChange(await api.partnerArea.setBannerOrder(positions))
    } catch {
      setPending(null)
      toast(t(ORDER_ERROR))
    }
  }

  const slotReorder = (index) => (baseItems.length > 1 ? { hook: reorder, index, count: baseItems.length } : null)

  return (
    <section className="partner-banner-editor" aria-labelledby={TITLE_ID}>
      <div className="partner-banner-head">
        <h2 id={TITLE_ID}>{t('Bannerfotos')}</h2>
        <p className="field-hint" id={HINT_ID}>
          {t('Fotos für den Kopf eures Portals – breite Querformate wirken am besten. JPG oder PNG.')}
          {baseItems.length > 1 && <> {t(REORDER_HINT)}</>}
        </p>
      </div>
      <BannerLayoutPicker value={current} onChange={handleLayout} busy={busy} />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="visually-hidden" aria-live="assertive">
        {reorder.announcement}
      </p>
      <ul className="partner-banner-list">
        {slots.map((slot) =>
          slot.item ? (
            <PartnerBannerSlot key={slot.item.fotoUrl} item={slot.item} label={slot.label} onChange={onChange} locked={locked} reorder={slotReorder(slot.position - 1)} />
          ) : (
            <AddSlot key={`frei-${slot.position}`} label={slot.label} busy={busy} locked={locked} onFile={handleAdd} />
          )
        )}
      </ul>
      {extra.length > 0 && (
        <div className="partner-banner-extra">
          <p className="field-hint">{t('Nicht im Banner – das Layout „{layout}“ zeigt weniger Fotos:', { layout: t(layoutLabel(current)) })}</p>
          <ul className="partner-banner-list">
            {extra.map((slot) => (
              <PartnerBannerSlot key={slot.item.fotoUrl} item={slot.item} label={slot.label} onChange={onChange} locked={locked} reorder={slotReorder(slot.position - 1)} />
            ))}
          </ul>
        </div>
      )}
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
