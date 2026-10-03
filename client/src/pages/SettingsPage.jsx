import { useSearchParams } from 'react-router-dom'
import TabBar from '../components/TabBar.jsx'
import DarstellungSection from '../components/settings/DarstellungSection.jsx'
import FamilienSection from '../components/settings/FamilienSection.jsx'
import ZuhauseSection from '../components/settings/ZuhauseSection.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { HOME_LABEL } from '../lib/areas.js'

// Adresse ?bereich=… - ohne oder mit unbekanntem Wert die Darstellung.
export const BEREICH_PARAM = 'bereich'
const DARSTELLUNG = 'darstellung'

function sectionsFor(family, words) {
  const sections = [{ key: DARSTELLUNG, label: 'Darstellung' }]
  // Familien und Zuhause gibt es nur für Haushalte - ein klassisches Rudel-Login hat nur die Darstellung.
  if (family.home?.art === 'zuhause') {
    sections.push({ key: 'familien', label: words.groups }, { key: 'zuhause', label: 'Mein Zuhause' })
  }
  return sections
}

// /einstellungen (Calm-down-Runde) in Zuhause und Familien (nicht in Partner- und Tierheim-Bereichen, nicht zu Besuch):
// alles, was man an sich selbst einstellt, an einer Stelle - Darstellung (Farbpalette, Hell/Dunkel, Schrift), die
// Familien samt der Frage, welche eigenen Tiere wo zu sehen sind, und das eigene Zuhause (Name, Auftritt, Zugang,
// Einladungen). Die Bereiche als Reiter (TabBar), der gewählte steht in der Adresse.
export default function SettingsPage({ family, onFamilyChange, onInvite }) {
  const { words } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const sections = sectionsFor(family, words)
  const wanted = searchParams.get(BEREICH_PARAM)
  const current = sections.some((section) => section.key === wanted) ? wanted : DARSTELLUNG

  function select(key) {
    setSearchParams(key === DARSTELLUNG ? {} : { [BEREICH_PARAM]: key }, { replace: true })
  }

  return (
    <div className="page settings-page">
      <header className="page-hero settings-hero">
        <div>
          <span className="eyebrow">{family.home?.art === 'zuhause' ? HOME_LABEL : family.name}</span>
          <h1>Einstellungen</h1>
          <p className="page-lede">
            {sections.length > 1 ? `Farben, Schrift und eure ${words.groups} – alles an einer Stelle.` : 'Farben und Schrift – so, wie ihr es am liebsten lest.'}
          </p>
        </div>
      </header>

      {sections.length > 1 && (
        <TabBar
          tabs={sections}
          current={current}
          label="Bereiche der Einstellungen"
          idPrefix="einstellungen"
          panelId="einstellungen-panel"
          className="settings-tabs"
          onSelect={select}
        />
      )}

      <div
        className="settings-panel"
        id="einstellungen-panel"
        role={sections.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={sections.length > 1 ? `einstellungen-${current}` : undefined}
      >
        {current === DARSTELLUNG && <DarstellungSection family={family} onFamilyChange={onFamilyChange} />}
        {current === 'familien' && <FamilienSection family={family} onFamilyChange={onFamilyChange} />}
        {current === 'zuhause' && <ZuhauseSection family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />}
      </div>
    </div>
  )
}
