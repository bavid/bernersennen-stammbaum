import { useEffect, useState } from 'react'
import { api } from '../api'

// Daten für den Visitenkarten-Designer (Phase V5, PartnerVisitenkartenPage): das eigene Profil (Name, Logo, Bannerfoto,
// Kontakt), die gespeicherte Gestaltung samt Zählern der Kunden-Gutscheine (api.partnerArea.visitenkarte) und die
// öffentliche Adresse für die QR-Codes (api.config - scheitert sie, gilt der Ursprung dieser Seite).
export default function useVisitenkarte() {
  const [data, setData] = useState({ profile: null, state: null, publicUrl: null, configReady: false, error: null })

  useEffect(() => {
    let cancelled = false
    const update = (patch) => {
      if (!cancelled) setData((current) => ({ ...current, ...patch }))
    }
    Promise.all([api.partnerArea.profile(), api.partnerArea.visitenkarte()])
      .then(([profile, state]) => update({ profile, state }))
      .catch((err) => update({ error: err.message }))
    Promise.resolve()
      .then(() => api.config())
      .then((config) => update({ publicUrl: config?.publicUrl || null, configReady: true }))
      .catch(() => update({ configReady: true }))
    return () => {
      cancelled = true
    }
  }, [])

  return data
}
