import { useEffect, useState } from 'react'
import { api } from '../../api'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import ShareSwitch from '../shares/ShareSwitch.jsx'
import { useToast } from '../Toast.jsx'
import { Button, EmptyState } from '../ui/index.js'
import RevierProfil from '../revier/RevierProfil.jsx'
import RevierProfilForm from '../revier/RevierProfilForm.jsx'
import useRevierEinstellungen from '../../hooks/useRevierEinstellungen.js'
import { useT } from '../../lib/i18n/index.js'
import '../../styles/revier.css'

function TierSchalter({ settings, busy, readOnly, onSave }) {
  const t = useT()
  const sichtbar = settings.tiere.filter((tier) => tier.sichtbar).map((tier) => tier.id)
  if (settings.tiere.length === 0) return <EmptyState icon="paw" title={t('Noch keine eigenen Tiere')} />
  const toggle = (id, on) => onSave(on ? [...sichtbar, id] : sichtbar.filter((other) => other !== id))
  return (
    <section className="settings-group" aria-labelledby="revier-tiere-schalter">
      <h3 id="revier-tiere-schalter">{t('Welche Tiere zeigt ihr?')}</h3>
      <p className="field-hint">{t('Jedes Tier einzeln – ohne Schalter bleibt es privat. Öffentliche Erinnerungen erscheinen nur bei gezeigten Tieren.')}</p>
      <ul className="share-switches revier-tier-schalter" role="list">
        {settings.tiere.map((tier) => (
          <li key={tier.id}>
            <Avatar dog={tier} size={32} />
            <ShareSwitch
              label={tier.oeffentlich ? t('{name} ({n} öffentliche Erinnerungen)', { name: tier.name, n: tier.oeffentlich }) : tier.name}
              checked={tier.sichtbar}
              disabled={readOnly}
              busy={busy}
              onChange={(on) => toggle(tier.id, on)}
            />
          </li>
        ))}
      </ul>
      {sichtbar.length < settings.tiere.length && (
        <Button variant="ghost" size="sm" disabled={readOnly || busy} onClick={() => onSave(settings.tiere.map((tier) => tier.id))}>
          {t('Alle zeigen')}
        </Button>
      )}
    </section>
  )
}

function FollowerListe({ anzahl, readOnly }) {
  const t = useT()
  const toast = useToast()
  const [liste, setListe] = useState(null)

  function load() {
    if (liste) return
    api.revier
      .follower()
      .then((data) => setListe(data.follower))
      .catch((err) => toast(err.message))
  }

  async function remove(id) {
    try {
      await api.revier.removeFollower(id)
      setListe((current) => current.filter((item) => item.id !== id))
    } catch (err) {
      toast(err.message)
    }
  }

  if (!anzahl) return <p className="muted">{t('Noch niemand folgt')}</p>
  return (
    <details className="revier-follower" onToggle={(event) => event.currentTarget.open && load()}>
      <summary>{t('{n} folgen euch – ansehen', { n: anzahl })}</summary>
      {!liste && <p className="muted">{t('Lädt …')}</p>}
      {liste && (
        <ul className="settings-list" role="list">
          {liste.map((item) => (
            <li key={item.id} className="settings-row">
              <span className="settings-row-main">{item.name || t('Ein Zuhause ohne öffentliches Profil')}</span>
              <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => remove(item.id)}>
                {t('Entfernen')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function Vorschau({ onClose }) {
  const t = useT()
  const [profil, setProfil] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let active = true
    api.revier.vorschau().then(
      (data) => active && setProfil(data),
      (err) => active && setError(err.message)
    )
    return () => {
      active = false
    }
  }, [])
  return (
    <Modal open title={t('So sehen andere euer Profil')} onClose={onClose} className="revier-vorschau">
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!profil && !error && <p className="muted">{t('Lädt …')}</p>}
      {profil && !profil.aktiv && <p className="field-hint">{t('Noch ausgeschaltet – so würde es aussehen.')}</p>}
      {profil && <RevierProfil profil={profil} vorschau />}
    </Modal>
  )
}

// Einstellungen › Wer sieht was › „Öffentlich“ (Phase M „Mein Revier“): das eigene öffentliche Profil - Schalter mit PLZ
// und Häkchen, Ort, Name, Text, Follower öffentlich/privat, je Tier ein Schalter und „Mein Profil für andere“.
export default function OeffentlichAnsicht({ readOnly, sicht }) {
  const t = useT()
  const revier = useRevierEinstellungen(sicht?.setRevier)
  const [vorschau, setVorschau] = useState(false)
  if (revier.error) return <EmptyState icon="lock" title={revier.error} />
  if (!revier.settings) return <p className="muted">{t('Lädt …')}</p>
  const { settings } = revier
  return (
    <section className="settings-group revier-einstellungen" aria-labelledby="revier-einstellungen-titel">
      <h3 id="revier-einstellungen-titel" className="visually-hidden">
        {t('Öffentlich')}
      </h3>
      <p className="field-hint">
        {t('Nur wenn ihr wollt: angemeldete Tierhalter in der Nähe sehen euer Profil unter Entdecken › Mein Revier. Nie Suchmaschinen, nie eure Adresse.')}
      </p>
      <Button variant="ghost" onClick={() => setVorschau(true)}>
        <Icon name="eye" />
        {t('Mein Profil für andere')}
      </Button>
      <RevierProfilForm settings={settings} busy={revier.busy} readOnly={readOnly} onSave={revier.save} />
      <TierSchalter settings={settings} busy={revier.busy} readOnly={readOnly} onSave={revier.saveTiere} />
      <section className="settings-group" aria-labelledby="revier-follower-titel">
        <h3 id="revier-follower-titel">{t('Folgende')}</h3>
        <FollowerListe anzahl={settings.follower} readOnly={readOnly} />
      </section>
      {vorschau && <Vorschau onClose={() => setVorschau(false)} />}
    </section>
  )
}
