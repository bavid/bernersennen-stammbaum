import { useEffect, useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import { CommunityBand } from './CommunityTicker.jsx'
import CommunityPanel from './CommunityPanel.jsx'
import { t } from '../lib/i18n/index.js'
import { BANNER_CHIPS, BANNER_TEXT_MAX, bannerForm, bannerPayload, bannerPreviewData, chosenPartner, filterPartners } from '../lib/communityBannerAdmin.js'
import '../styles/admin-community-banner.css'
import { Button } from './ui/index.js'

// Admin, Reiter „Empfehlungen“: Karte „Band ‚Mit dabei‘“ - was das Band oben auf der Startseite zeigt (GET/PUT
// /api/admin/community/banner, server/lib/communityBanner.js): Partner des Monats (Suche + Auswahl, optional „bis“),
// welche Zahlen, ein eigener kurzer Eintrag mit internem Link. Rechts die Vorschau aus dem Formular (CommunityBand).
const ID = 'admin-band-'
const id = (key) => `${ID}${key}`

function PartnerPicker({ info, form, update }) {
  const [query, setQuery] = useState('')
  const partners = filterPartners(info.partners, query, form.partnerId)
  const selected = info.partners.find((p) => String(p.id) === form.partnerId)
  const hidden = form.partnerId && !chosenPartner(form, info)
  return (
    <fieldset className="admin-band-fieldset">
      <legend>{t('Partner des Monats')}</legend>
      <AdminField id={id('suche')} label={t('Partner suchen')}>
        <input id={id('suche')} type="search" value={query} placeholder={t('Name eingeben …')} onChange={(e) => setQuery(e.target.value)} />
      </AdminField>
      <AdminField id={id('partner')} label={t('Partner')} hint={t('Ohne Wahl zeigt das Band die vorgestellten Partner.')}>
        <select {...fieldProps(id('partner'), { hint: true })} value={form.partnerId} onChange={(e) => update('partnerId', e.target.value)}>
          <option value="">{t('– keiner –')}</option>
          {partners.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.isDemo ? `${p.name} (Demo)` : p.name}
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField id={id('bis')} label={t('bis (optional)')}>
        <input id={id('bis')} type="date" value={form.bis} disabled={!form.partnerId} onChange={(e) => update('bis', e.target.value)} />
      </AdminField>
      {selected && (
        <p className="field-hint">
          {t('{n} Fotos', { n: selected.fotos?.length || 0 })}
          {hidden && ` · ${t('Erscheint gerade nicht (abgelaufen oder Demo ohne Freigabe).')}`}
        </p>
      )}
    </fieldset>
  )
}

function ChipSwitches({ chips, onToggle }) {
  return (
    <fieldset className="admin-band-fieldset">
      <legend>{t('Zahlen im Band')}</legend>
      <div className="admin-band-chips">
        {BANNER_CHIPS.map((chip) => (
          <label key={chip.key} className="check">
            <input type="checkbox" checked={chips.includes(chip.key)} onChange={() => onToggle(chip.key)} />
            {t(chip.label)}
          </label>
        ))}
      </div>
      <p className="field-hint">{t('Die Reihenfolge ist fest. Zahlen, die 0 sind, fallen von selbst weg.')}</p>
    </fieldset>
  )
}

function HinweisFields({ form, errors, update }) {
  return (
    <fieldset className="admin-band-fieldset">
      <legend>{t('Eigener Eintrag (optional)')}</legend>
      <AdminField id={id('text')} label={t('Text')} error={errors.text && t(errors.text)} hint={`${form.text.length} / ${BANNER_TEXT_MAX} ${t('Zeichen')}`}>
        <input {...fieldProps(id('text'), { error: errors.text, hint: true })} value={form.text} maxLength={BANNER_TEXT_MAX} placeholder={t('z. B. Neu: Wir waren hier')} onChange={(e) => update('text', e.target.value)} />
      </AdminField>
      <AdminField id={id('link')} label={t('Link (optional)')} error={errors.link && t(errors.link)} hint={t('Nur ein Pfad in der App, z. B. /partner-werden')}>
        <input {...fieldProps(id('link'), { error: errors.link, hint: true })} value={form.link} placeholder="/partner-werden" onChange={(e) => update('link', e.target.value)} />
      </AdminField>
    </fieldset>
  )
}

function useBannerInfo() {
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState(null)
  useEffect(() => {
    let cancelled = false
    api.admin
      .communityBanner()
      .then((result) => !cancelled && setInfo(result))
      .catch((err) => !cancelled && setLoadError(err.message))
    return () => {
      cancelled = true
    }
  }, [])
  return { info, setInfo, loadError }
}

// Vorschau wie auf der Startseite: als Leiste (Handy) oder als Seitenkarte (großer Bildschirm, CommunityPanel).
function BannerPreview({ data }) {
  const [asPanel, setAsPanel] = useState(false)
  return (
    <figure className="admin-finanz-preview admin-band-preview">
      <figcaption className="field-hint">{t('Vorschau – so steht das Band auf der Startseite.')}</figcaption>
      <div className="segmented admin-band-preview-switch" role="group" aria-label={t('Vorschau als')}>
        <button type="button" aria-pressed={!asPanel} onClick={() => setAsPanel(false)}>
          {t('Leiste')}
        </button>
        <button type="button" aria-pressed={asPanel} onClick={() => setAsPanel(true)}>
          {t('Seitenkarte')}
        </button>
      </div>
      {asPanel ? <CommunityPanel data={data} fallback className="admin-band-panel" /> : <CommunityBand data={data} fallback />}
    </figure>
  )
}

function BannerForm({ info, onSaved }) {
  const [form, setForm] = useState(() => bannerForm(info.banner))
  const [state, setState] = useState({ saving: false, saved: false, error: null, errors: {} })
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setState((s) => ({ ...s, saved: false, errors: { ...s.errors, [key]: undefined } }))
  }
  const toggleChip = (key) => update('chips', form.chips.includes(key) ? form.chips.filter((k) => k !== key) : [...form.chips, key])

  async function submit(event) {
    event.preventDefault()
    const { payload, errors } = bannerPayload(form)
    if (!payload) return setState((s) => ({ ...s, saved: false, errors }))
    setState({ saving: true, saved: false, error: null, errors: {} })
    try {
      const { banner } = await api.admin.saveCommunityBanner(payload)
      setForm(bannerForm(banner))
      onSaved(banner)
      setState({ saving: false, saved: true, error: null, errors: {} })
    } catch (err) {
      setState({ saving: false, saved: false, error: err.message, errors: {} })
    }
  }

  return (
    <div className="admin-finanz-layout">
      <form className="form-stack" onSubmit={submit} noValidate>
        {state.error && (
          <div className="error-banner" role="alert">
            {state.error}
          </div>
        )}
        <PartnerPicker info={info} form={form} update={update} />
        <ChipSwitches chips={form.chips} onToggle={toggleChip} />
        <HinweisFields form={form} errors={state.errors} update={update} />
        <div className="form-actions">
          <Button type="submit" disabled={state.saving}>
            {state.saving ? t('Speichere …') : t('Speichern')}
          </Button>
          {state.saved && (
            <span className="field-hint" role="status">
              {t('Gespeichert.')}
            </span>
          )}
        </div>
      </form>
      <BannerPreview data={bannerPreviewData(form, info)} />
    </div>
  )
}

export default function AdminCommunityBanner() {
  const { info, setInfo, loadError } = useBannerInfo()
  return (
    <section className="card admin-finanz-card admin-band" aria-labelledby={id('title')}>
      <h2 id={id('title')}>{t('Band „Mit dabei“')}</h2>
      <p className="admin-section-intro muted">
        {t('Das schmale Band oben auf der Startseite: Partner des Monats mit seinen Fotos, ein paar Zahlen und auf Wunsch ein eigener kurzer Eintrag.')}
      </p>
      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {!info && !loadError && <p className="muted">{t('Lade …')}</p>}
      {info && <BannerForm info={info} onSaved={(banner) => setInfo((current) => ({ ...current, banner }))} />}
    </section>
  )
}
