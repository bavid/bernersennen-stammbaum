import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { EmptyState } from '../ui/index.js'
import RevierKarte from './RevierKarte.jsx'
import { DEFAULT_UMKREIS, TIERARTEN, UMKREISE } from '../../lib/revier.js'
import { readSetting, writeSetting } from '../../lib/storage.js'
import { useT } from '../../lib/i18n/index.js'

const PLZ_RE = /^\d{5}$/

function storedUmkreis() {
  const value = readSetting('revierUmkreis', DEFAULT_UMKREIS)
  return UMKREISE.includes(value) ? value : DEFAULT_UMKREIS
}

// Kleines Formular, wenn der Server eine PLZ braucht (weder gemerkt noch im eigenen Profil).
function PlzFrage({ onPlz }) {
  const t = useT()
  const [value, setValue] = useState('')
  return (
    <form
      className="revier-plz"
      onSubmit={(event) => {
        event.preventDefault()
        if (PLZ_RE.test(value)) onPlz(value)
      }}
    >
      <label className="field">
        <span className="field-label">{t('Eure Postleitzahl')}</span>
        <input inputMode="numeric" maxLength={5} value={value} onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!PLZ_RE.test(value)}>
        {t('Zeigen')}
      </button>
    </form>
  )
}

function Filter({ umkreis, tierart, onUmkreis, onTierart }) {
  const t = useT()
  return (
    <div className="revier-filter">
      <div className="revier-chips" role="group" aria-label={t('Umkreis')}>
        {UMKREISE.map((km) => (
          <button key={km} type="button" className="chip" aria-pressed={umkreis === km} onClick={() => onUmkreis(km)}>
            {t('bis {km} km', { km })}
          </button>
        ))}
      </div>
      <label className="revier-tierart">
        <span className="visually-hidden">{t('Tierart')}</span>
        <select value={tierart} onChange={(event) => onTierart(event.target.value)}>
          {TIERARTEN.map((art) => (
            <option key={art.key} value={art.key}>
              {t(art.label)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

const withFolgen = (data, slug, folgeIch) => ({
  ...data,
  profile: data.profile.map((profil) => (profil.slug === slug ? { ...profil, folgeIch } : profil))
})

// „In der Nähe“: öffentliche Profile im Umkreis - nur als Entfernungsstufe. Die PLZ (gemerkt in Entdecken oder aus dem
// eigenen Profil) geht nur im Body an den Server (POST /api/revier/radar).
export default function RevierRadar({ plz, onPlzChange }) {
  const t = useT()
  const [umkreis, setUmkreis] = useState(storedUmkreis)
  const [tierart, setTierart] = useState('')
  const [state, setState] = useState({ loading: true, data: null, error: null, needsPlz: false })
  const latest = useRef(0)
  const usePlz = PLZ_RE.test(plz || '') ? plz : null

  useEffect(() => {
    writeSetting('revierUmkreis', umkreis)
    latest.current += 1
    const id = latest.current
    setState((current) => ({ ...current, loading: true, error: null }))
    api.revier
      .radar({ plz: usePlz, umkreis, tierart })
      .then((data) => id === latest.current && setState({ loading: false, data, error: null, needsPlz: false }))
      .catch((err) => {
        if (id !== latest.current) return
        const needsPlz = err.details?.code === 'PLZ'
        setState({ loading: false, data: null, error: needsPlz ? null : err.message, needsPlz })
      })
  }, [usePlz, umkreis, tierart])

  const profile = state.data?.profile || []
  return (
    <section className="revier-radar" aria-busy={state.loading || undefined}>
      <Filter umkreis={umkreis} tierart={tierart} onUmkreis={setUmkreis} onTierart={setTierart} />
      {state.data?.ort && <p className="muted revier-um">{t('Rund um {ort}', { ort: state.data.ort })}</p>}
      {state.needsPlz && <PlzFrage onPlz={onPlzChange} />}
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      {state.loading && !state.data && <p className="muted">{t('Lädt …')}</p>}
      {state.data && profile.length === 0 && (
        <EmptyState icon="compass" title={t('Hier zeigt noch niemand ein öffentliches Profil.')}>
          {t('Probiert einen größeren Umkreis – oder zeigt als Erste euer eigenes.')}
        </EmptyState>
      )}
      {profile.length > 0 && (
        <ul className="revier-liste" role="list">
          {profile.map((profil) => (
            <RevierKarte
              key={profil.slug}
              profil={profil}
              onFolgen={(slug, folgeIch) => setState((current) => ({ ...current, data: withFolgen(current.data, slug, folgeIch) }))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
