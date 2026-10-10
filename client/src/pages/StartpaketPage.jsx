import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Button, EmptyState } from '../components/ui'
import PrintMessage from '../components/PrintMessage.jsx'
import StartpaketSheets from '../components/startpaket/StartpaketSheets.jsx'
import { usePrintBodyClass } from '../components/VoucherPrintView.jsx'
import { isReadOnly } from '../lib/demo.js'
import { parseAreaId } from '../lib/areas.js'
import { buildStartpaket, canOpenStartpaket } from '../lib/startpaket.js'
import { displayName } from '../lib/timeline.js'
import { t } from '../lib/i18n/index.js'

// Druckseite „Tierheim-Startpaket“ (/tier/:id/startpaket, App.jsx: nur in Tierheim-Bereichen, ohne App-Hülle wie die
// Gutschein-Druckseiten). Zeigt die drei A4-Seiten (components/startpaket/StartpaketSheets). Der Übergabe-Code kommt
// aus dem State der Navigation (HandoverDialog „Startpaket drucken“) oder wird hier wie im Dialog erzeugt - nie aus der
// Adresse. Nach dem Lesen wird er aus dem Verlauf (history.state) entfernt, er lebt nur im State der Seite.

export const DENIED_TEXT = 'Das Startpaket gibt es nur für das Tierheim, bei dem das Tier lebt.'
export const DEMO_HINT = 'Demo: Der QR-Code ist ein Muster und lässt sich nicht einlösen.'

function useStartpaketData(id) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let current = true
    if (!id) {
      setError(t('Dieses Tier gibt es hier nicht.'))
      return undefined
    }
    Promise.all([api.getDog(id), api.listTimeline(id), api.partnerArea.profile().catch(() => null)])
      .then(([dog, entries, profile]) => current && setData({ dog, entries, profile }))
      .catch((err) => current && setError(err.message))
    return () => {
      current = false
    }
  }, [id])
  return { data, error }
}

// Code aus dem Navigations-State einmal übernehmen und dann aus dem Verlauf streichen.
function useHandoverFromState() {
  const location = useLocation()
  const navigate = useNavigate()
  const [handover, setHandover] = useState(() => location.state?.handover || null)
  useEffect(() => {
    if (location.state?.handover) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])
  return [handover, setHandover]
}

function CreateHandover({ dog, onCreated }) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      onCreated(await api.createHandover(dog.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }
  return (
    <div className="startpaket-create">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <p>{t('Es wird ein Übergabe-Code erzeugt, {name} wird als reserviert markiert; ein früherer Übergabe-Code wird ungültig.', { name: displayName(dog) })}</p>
      <Button variant="ghost" disabled={creating || dog.vermittlung_status === 'pausiert'} onClick={handleCreate}>
        {creating ? t('Erzeuge …') : t('Übergabe-Code erzeugen')}
      </Button>
    </div>
  )
}

function Toolbar({ dogId }) {
  return (
    <div className="print-toolbar">
      <Button variant="ghost" as={Link} to={`/tier/${dogId}`}>
        {t('Zurück zum Tier')}
      </Button>
      <span className="print-toolbar-spacer" />
      <Button onClick={() => window.print()}>{t('Drucken')}</Button>
    </div>
  )
}

export default function StartpaketPage({ dogId, family }) {
  usePrintBodyClass()
  const id = parseAreaId(dogId)
  const { data, error } = useStartpaketData(id)
  const [handover, setHandover] = useHandoverFromState()
  const isDemo = isReadOnly(family)

  if (error) {
    return (
      <PrintMessage>
        <div className="error-banner" role="alert">
          {error}
        </div>
      </PrintMessage>
    )
  }
  if (!data) return <div className="print-page" aria-busy="true" />
  if (!canOpenStartpaket(family, data.dog)) {
    return (
      <PrintMessage dogId={id}>
        <EmptyState icon="lock" title={t('Kein Zugriff')}>
          {t(DENIED_TEXT)}
        </EmptyState>
      </PrintMessage>
    )
  }

  const shelter = { name: data.profile?.name || family.partner?.name || family.name, logoUrl: data.profile?.logoUrl }
  const model = buildStartpaket({ dog: data.dog, entries: data.entries, shelter, handover, origin: window.location.origin, isDemo })
  return (
    <div className="print-page startpaket-page">
      <Toolbar dogId={id} />
      <main className="print-main">
        <header className="print-head">
          <h1>{t('Startpaket – {name}', { name: model.profile.name })}</h1>
          <p className="print-head-meta">{t('Drei Seiten A4 für die neuen Menschen: Steckbrief, erste Erinnerungen und der Übergabe-QR.')}</p>
          {isDemo && <p className="field-hint">{t(DEMO_HINT)}</p>}
          {!isDemo && !handover && <CreateHandover dog={data.dog} onCreated={setHandover} />}
        </header>
        <StartpaketSheets model={model} />
      </main>
    </div>
  )
}
