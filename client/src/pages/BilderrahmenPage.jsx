import { useCallback, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import Bilderrahmen from '../components/bilderrahmen/Bilderrahmen.jsx'
import FrameAuswahl from '../components/bilderrahmen/FrameAuswahl.jsx'
import FrameMessage from '../components/bilderrahmen/FrameMessage.jsx'
import usePeriodicLoad from '../hooks/usePeriodicLoad.js'
import { readSetting, writeSetting } from '../lib/storage.js'
import {
  REFRESH_MS,
  SESSION_AUSWAHL_KEY,
  SESSION_OPTIONEN_KEY,
  cleanAuswahl,
  readOptionen,
  writeOptionen
} from '../lib/bilderrahmen.js'
import { t } from '../lib/i18n/index.js'

const EMPTY = []

// ?tier=<id> (aus dem Tierprofil „Als Bilderrahmen zeigen“): nur dieses Tier, ohne die gemerkte Auswahl zu ändern.
// Die Auswahl merkt sich das Gerät je Bereich: im eigenen Zuhause wie bisher, für eine Familie unter eigenem Schlüssel
// (ihre Tiere sind andere).
const auswahlKey = (areaKey) => (areaKey ? `${SESSION_AUSWAHL_KEY}.${areaKey}` : SESSION_AUSWAHL_KEY)

function initialAuswahl(searchParams, storageKey) {
  const tier = Number(searchParams.get('tier'))
  if (Number.isInteger(tier) && tier > 0) return { tiere: [tier], zeitraum: 'alle', privat: false }
  return cleanAuswahl(readSetting(storageKey, null))
}

// /bilderrahmen (im eigenen Zuhause, AreaGate "home"): die Fotos eurer Tiere als Diashow - Tier- und Erinnerungsfotos, die
// dieses Zuhause sieht (GET /api/bilderrahmen/fotos), alle 30 Minuten neu geholt. Auswahl und Anzeige merkt sich das Gerät.
// „Beenden“ führt dorthin zurück, wo man herkam (sonst nach Start).
// areaKey (B+ Familienalbum): die Id einer Familie, wenn die Diashow aus deren Gruppenseite kommt (/bilderrahmen?in=…) -
// dann ohne „private Erinnerungen“ (die zeigt der Server ohnehin nur im eigenen Zuhause).
export default function BilderrahmenPage({ areaKey = null }) {
  const storageKey = auswahlKey(areaKey)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [auswahl, setAuswahl] = useState(() => initialAuswahl(searchParams, storageKey))
  const [optionen, setOptionen] = useState(() => readOptionen(SESSION_OPTIONEN_KEY))
  const loader = useCallback(() => api.bilderrahmenFotos(auswahl), [auswahl])
  const { data, error, loading, reload } = usePeriodicLoad(loader, {
    intervalMs: REFRESH_MS,
    key: `${auswahl.tiere.join(',')}|${auswahl.zeitraum}|${auswahl.privat}`
  })

  function changeAuswahl(next) {
    const clean = cleanAuswahl(next)
    setAuswahl(clean)
    writeSetting(storageKey, clean)
  }

  function changeOptionen(next) {
    setOptionen(next)
    writeOptionen(SESSION_OPTIONEN_KEY, next)
  }

  function exit() {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate('/start')
  }

  const fotos = data?.fotos || EMPTY
  const tiere = data?.tiere || EMPTY

  if (!data && loading) return <FrameMessage title={t('Fotos werden geholt …')} />
  if (!data && error) {
    return (
      <FrameMessage title={t('Das hat nicht geklappt')} tone="ended">
        <p>{error.message}</p>
        <button type="button" className="btn btn-primary" onClick={reload}>
          {t('Noch einmal versuchen')}
        </button>
        <Link to="/start" className="btn btn-ghost">
          {t('Zurück zu Start')}
        </Link>
      </FrameMessage>
    )
  }

  // Private Erinnerungen nur auf Wunsch (der Server zeigt sie ohnehin nur im eigenen Zuhause).
  const auswahlUi = <FrameAuswahl tiere={tiere} auswahl={auswahl} onChange={changeAuswahl} showPrivat={!areaKey} />

  if (fotos.length === 0) {
    const filtered = auswahl.tiere.length > 0 || auswahl.zeitraum !== 'alle'
    return (
      <FrameMessage title={filtered ? t('Hier gibt es (noch) keine Fotos') : t('Noch keine Fotos')}>
        <p>
          {filtered
            ? t('Für diese Auswahl haben wir keine Fotos gefunden.')
            : t('Sobald ihr Fotos zu euren Tieren oder Erinnerungen hochladet, zeigt sie der Bilderrahmen hier.')}
        </p>
        {filtered && (
          <button type="button" className="btn btn-primary" onClick={() => changeAuswahl({ ...auswahl, tiere: [], zeitraum: 'alle' })}>
            {t('Alle Fotos zeigen')}
          </button>
        )}
        <Link to="/start" className="btn btn-ghost">
          {t('Zurück zu Start')}
        </Link>
      </FrameMessage>
    )
  }

  return (
    <Bilderrahmen
      fotos={fotos}
      optionen={optionen}
      onOptionenChange={changeOptionen}
      onExit={exit}
      onReload={reload}
      auswahl={auswahlUi}
    />
  )
}
