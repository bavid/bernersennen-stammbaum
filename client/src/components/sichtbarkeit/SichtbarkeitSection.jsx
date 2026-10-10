import { useSearchParams } from 'react-router-dom'
import TabBar from '../TabBar.jsx'
import useShareMatrix from '../../hooks/useShareMatrix.js'
import useSichtbarkeit from '../../hooks/useSichtbarkeit.js'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { withShareChange } from '../../lib/animalCounts.js'
import { parseAreaId } from '../../lib/areas.js'
import { ANSICHTEN } from '../../lib/sichtbarkeit.js'
import SichtbarkeitLegende from './SichtbarkeitLegende.jsx'
import TiereAnsicht from './TiereAnsicht.jsx'
import VerbindungenAnsicht from './VerbindungenAnsicht.jsx'
import ErinnerungenAnsicht from './ErinnerungenAnsicht.jsx'
import VorschauAnsicht from './VorschauAnsicht.jsx'
import OeffentlichAnsicht from './OeffentlichAnsicht.jsx'
import { useT } from '../../lib/i18n/index.js'
import '../../styles/sichtbarkeit.css'

export const ANSICHT_PARAM = 'ansicht'
export const TIER_PARAM = 'tier'

const LABELS = {
  tiere: 'Tiere',
  verbindungen: 'Familien & Gäste',
  erinnerungen: 'Erinnerungen',
  vorschau: 'So sieht es …',
  oeffentlich: 'Öffentlich'
}

// Die Ansichten teilen sich EINEN Freigabe-Zustand (useShareMatrix) - ein Schalter unter „Tiere“ steht sofort auch unter
// „Familien & Gäste“ und in der Vorschau. Erst nach dem Laden gerendert (die Matrix startet mit den geladenen Freigaben).
function Ansichten({ family, sicht, current, focusDogId, onFamilyChange, onSelect, onShowMemories }) {
  const readOnly = useIsDemo()
  const { data } = sicht
  const matrix = useShareMatrix(data.animals, (dogId, shares) => {
    const dog = data.animals.find((entry) => entry.id === dogId)
    if (dog) onFamilyChange?.((me) => withShareChange(me, dog, dog.shares, shares))
    sicht.updateShares(dogId, shares)
  })
  const shared = { family, data, matrix, readOnly, sicht }
  return (
    <div className="sicht-panel" id="sichtbarkeit-panel" role="tabpanel" aria-labelledby={`sichtbarkeit-${current}`}>
      {current === 'tiere' && <TiereAnsicht {...shared} focusDogId={focusDogId} onShowMemories={onShowMemories} />}
      {current === 'verbindungen' && <VerbindungenAnsicht {...shared} />}
      {current === 'erinnerungen' && <ErinnerungenAnsicht {...shared} dogId={focusDogId} onSelectDog={(id) => onSelect('erinnerungen', id)} />}
      {current === 'vorschau' && <VorschauAnsicht {...shared} />}
      {current === 'oeffentlich' && <OeffentlichAnsicht {...shared} />}
    </div>
  )
}

// Einstellungen › Wer sieht was: alles zur Sichtbarkeit an einer Stelle - je Tier, je Familie/Gast, je Erinnerung und
// „So sieht es …“. Oben die vier Wörter in einfachem Deutsch. Ansicht und Tier stehen in der Adresse (?ansicht=, ?tier=),
// so führt „Wer sieht …?“ auf der Tierseite direkt zu diesem Tier.
export default function SichtbarkeitSection({ family, onFamilyChange }) {
  const t = useT()
  const readOnlyHint = useReadOnlyHint()
  const readOnly = useIsDemo()
  const [searchParams, setSearchParams] = useSearchParams()
  const sicht = useSichtbarkeit(family.id)
  const wanted = searchParams.get(ANSICHT_PARAM)
  const current = ANSICHTEN.includes(wanted) ? wanted : 'tiere'
  const focusDogId = parseAreaId(searchParams.get(TIER_PARAM))

  function select(key, dogId = null) {
    const next = new URLSearchParams(searchParams)
    next.set(ANSICHT_PARAM, key)
    if (dogId) next.set(TIER_PARAM, String(dogId))
    else next.delete(TIER_PARAM)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="settings-block sichtbarkeit">
      <SichtbarkeitLegende />
      {readOnly && <p className="field-hint">{readOnlyHint}</p>}
      <TabBar
        tabs={ANSICHTEN.map((key) => ({ key, label: t(LABELS[key]) }))}
        current={current}
        label={t('Wer sieht was')}
        idPrefix="sichtbarkeit"
        panelId="sichtbarkeit-panel"
        className="sicht-tabs"
        onSelect={(key) => select(key)}
      />
      {sicht.error && (
        <div className="error-banner" role="alert">
          {sicht.error}
        </div>
      )}
      {!sicht.data && !sicht.error && <p className="muted">{t('Lädt …')}</p>}
      {sicht.data && (
        <Ansichten
          family={family}
          current={current}
          sicht={sicht}
          focusDogId={focusDogId}
          onFamilyChange={onFamilyChange}
          onSelect={select}
          onShowMemories={(dogId) => select('erinnerungen', dogId)}
        />
      )}
    </div>
  )
}
