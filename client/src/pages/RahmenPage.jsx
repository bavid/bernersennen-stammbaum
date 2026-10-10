import { useCallback, useEffect, useMemo, useState } from 'react'
import Bilderrahmen from '../components/bilderrahmen/Bilderrahmen.jsx'
import FrameMessage from '../components/bilderrahmen/FrameMessage.jsx'
import usePeriodicLoad from '../hooks/usePeriodicLoad.js'
import { useNoIndex } from '../hooks/useNoIndex.js'
import { readSetting, writeSetting } from '../lib/storage.js'
import { DEVICE_OPTIONEN_KEY, DEVICE_REFRESH_MS, cleanOptionen, diffOptionen } from '../lib/bilderrahmen.js'
import { fetchRahmenFotos, forgetRahmenToken, takeRahmenToken } from '../lib/rahmenGeraet.js'
import { t } from '../lib/i18n/index.js'

// Ohne Netz: nach einer Minute noch einmal (sonst alle 10 Minuten, DEVICE_REFRESH_MS).
const RETRY_MS = 60 * 1000
const EMPTY = []

// Optionen des Rahmen-Links (vom Server) mit den Abweichungen, die jemand an diesem Gerät eingestellt hat.
function useDeviceOptionen(base) {
  const [overrides, setOverrides] = useState(() => readSetting(DEVICE_OPTIONEN_KEY, {}))
  const baseOptionen = useMemo(() => cleanOptionen(base), [base])
  const optionen = useMemo(() => cleanOptionen(overrides, baseOptionen), [overrides, baseOptionen])
  const change = useCallback(
    (next) => {
      const diff = diffOptionen(cleanOptionen(next), baseOptionen)
      setOverrides(diff)
      writeSetting(DEVICE_OPTIONEN_KEY, diff)
    },
    [baseOptionen]
  )
  return [optionen, change]
}

function NotConnected() {
  return (
    <FrameMessage title={t('Noch kein Bilderrahmen verbunden')}>
      <p>{t('Öffnet auf diesem Gerät den Link, den ihr in den Einstellungen unter „Mein Zuhause“ für einen Bilderrahmen erstellt habt.')}</p>
    </FrameMessage>
  )
}

function Ended() {
  return (
    <FrameMessage title={t('Dieser Bilderrahmen wurde beendet')} tone="ended">
      <p>{t('Wer ihn eingerichtet hat, kann in den Einstellungen unter „Mein Zuhause“ einen neuen Link erstellen.')}</p>
    </FrameMessage>
  )
}

function DeviceFrame({ token }) {
  const loader = useCallback(() => fetchRahmenFotos(token), [token])
  const { data, error, reload } = usePeriodicLoad(loader, { intervalMs: DEVICE_REFRESH_MS, key: token })
  const [optionen, changeOptionen] = useDeviceOptionen(data?.optionen)
  const [resting, setResting] = useState(false)
  const ended = error?.kind === 'beendet'

  useEffect(() => {
    if (ended) forgetRahmenToken()
  }, [ended])

  useEffect(() => {
    if (!error || ended) return undefined
    const timer = setTimeout(reload, RETRY_MS)
    return () => clearTimeout(timer)
  }, [error, ended, reload])

  if (ended) return <Ended />
  if (!data) {
    return <FrameMessage title={error ? t('Keine Verbindung') : t('Fotos werden geholt …')}>{error && <p>{error.message}</p>}</FrameMessage>
  }
  if (resting) {
    return (
      <FrameMessage title={t('Der Bilderrahmen ruht')}>
        <button type="button" className="btn btn-primary" onClick={() => setResting(false)}>
          {t('Weiter zeigen')}
        </button>
      </FrameMessage>
    )
  }
  const fotos = data.fotos || EMPTY
  if (fotos.length === 0) {
    return (
      <FrameMessage title={t('Noch keine Fotos')}>
        <p>{t('Sobald neue Fotos dazukommen, zeigt sie dieser Bilderrahmen von selbst.')}</p>
      </FrameMessage>
    )
  }
  return (
    <Bilderrahmen
      fotos={fotos}
      optionen={optionen}
      onOptionenChange={changeOptionen}
      onExit={() => setResting(true)}
      onReload={reload}
      label={data.name ? t('Bilderrahmen „{name}“', { name: data.name }) : 'Bilderrahmen'}
    />
  )
}

// /rahmen (öffentlich, ohne Anmeldung, App.jsx): der Bilderrahmen auf einem anderen Gerät, z. B. Omas Tablet. Das Token
// kommt einmal über /rahmen#TOKEN (lib/rahmenGeraet.js), danach aus dem Speicher des Geräts. Widerrufen oder unbekannt:
// „Dieser Bilderrahmen wurde beendet“ - das gemerkte Token fällt dann weg. Nie in Suchmaschinen (noindex).
export default function RahmenPage() {
  useNoIndex()
  const [token] = useState(() => takeRahmenToken())
  if (!token) return <NotConnected />
  return <DeviceFrame token={token} />
}
