import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Button, Card, Chip, SectionHeader } from './ui'
import AdminLandeadresseForm from './AdminLandeadresseForm.jsx'
import { t } from '../lib/i18n/index.js'
import { formatNumber } from '../lib/adminStats.js'

// Karte „Landeadressen“ im Reiter „Empfehlungen“ (Plan 2027 Kap. 6 „Messen ohne Tracking“,
// server/routes/adminLandeadressen.js): eigene Kurzadressen je Kanal (/fb, /anzeige-herbst), die anonym zählen und in
// die App weiterleiten. Je Adresse Besuche (30 Tage / gesamt) und - mit Code-Serie - die eingelösten Codes daneben.
export default function AdminLandeadressen() {
  const [rows, setRows] = useState(undefined)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('')

  const load = useCallback(
    () =>
      api.admin
        .landeadressen()
        .then((data) => {
          setRows(data.landeadressen)
          setError(null)
        })
        .catch((err) => setError(err.message)),
    []
  )

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate(payload) {
    const created = await api.admin.createLandeadresse(payload)
    setStatus(t('/{slug} angelegt', { slug: created.slug }))
    await load()
  }

  async function handleToggle(row) {
    try {
      await api.admin.updateLandeadresse(row.id, { aktiv: !row.aktiv })
      setStatus(row.aktiv ? t('/{slug} ausgeschaltet', row) : t('/{slug} eingeschaltet', row))
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card as="section" className="admin-landeadressen" aria-labelledby="admin-landeadressen-title">
      <SectionHeader
        id="admin-landeadressen-title"
        title={t('Landeadressen')}
        description={t('Eine eigene Adresse je Kanal. Jeder Aufruf zählt anonym – ohne IP, ohne Cookie – und führt dann in die App.')}
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <p className="visually-hidden" role="status">
        {status}
      </p>
      <AdminLandeadresseForm onCreate={handleCreate} />
      {rows === undefined && !error && <p className="muted">{t('Lade …')}</p>}
      {rows && rows.length === 0 && <p className="muted">{t('Noch keine Landeadressen')}</p>}
      {rows && rows.length > 0 && <LandeadressenTable rows={rows} onToggle={handleToggle} />}
    </Card>
  )
}

function LandeadressenTable({ rows, onToggle }) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table stat-table">
        <thead>
          <tr>
            <th scope="col">{t('Adresse')}</th>
            <th scope="col">{t('Ziel')}</th>
            <th scope="col" className="stat-num">{t('Besuche 30 Tage')}</th>
            <th scope="col" className="stat-num">{t('Besuche gesamt')}</th>
            <th scope="col">{t('Codes eingelöst')}</th>
            <th scope="col">{t('Status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">/{row.slug}</th>
              <td>{row.ziel}</td>
              <td className="stat-num">{formatNumber(row.besuche30)}</td>
              <td className="stat-num">{formatNumber(row.besucheGesamt)}</td>
              <td>{serieText(row)}</td>
              <td>
                <Chip tone={row.aktiv ? 'ok' : 'neutral'}>{row.aktiv ? t('aktiv') : t('aus')}</Chip>{' '}
                <Button variant="ghost" size="sm" onClick={() => onToggle(row)}>
                  {row.aktiv ? t('Ausschalten') : t('Einschalten')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function serieText(row) {
  if (!row.serie || !row.einloesungen) return '–'
  return t('{serie}: {tage30} in 30 Tagen, {gesamt} gesamt', { serie: row.serie, ...row.einloesungen })
}
