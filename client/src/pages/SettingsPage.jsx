import { useSearchParams } from 'react-router-dom'
import TabBar from '../components/TabBar.jsx'
import DarstellungSection from '../components/settings/DarstellungSection.jsx'
import FamilienSection from '../components/settings/FamilienSection.jsx'
import ZuhauseSection from '../components/settings/ZuhauseSection.jsx'
import AppSection from '../components/settings/AppSection.jsx'
import FamilyManage from '../components/settings/FamilyManage.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { SETTINGS_FAMILY_PARAM, areaContext, parseAreaId } from '../lib/areas.js'
import { useT } from '../lib/i18n/index.js'

// Adresse ?bereich=… - ohne oder mit unbekanntem Wert die Darstellung.
export const BEREICH_PARAM = 'bereich'
const DARSTELLUNG = 'darstellung'
const APP = 'app'

function sectionsFor(family, words, t) {
  const sections = [{ key: DARSTELLUNG, label: t('settings.tab.darstellung') }]
  // Familien und Zuhause gibt es nur für Haushalte; ein klassisches Rudel-Login verwaltet hier seine eine Familie.
  if (family.home?.art === 'zuhause') {
    sections.push({ key: 'familien', label: t('settings.tab.groups', words) }, { key: 'zuhause', label: t('settings.tab.zuhause') })
  } else {
    sections.push({ key: 'familien', label: t('settings.tab.group', words) })
  }
  // „App“: als App aufs Handy (Install-Hinweis) - für alle gleich.
  sections.push({ key: APP, label: t('settings.tab.app') })
  return sections
}

// Familien: die Liste (FamilienSection) oder - mit ?familie=<aktiver Bereich> bzw. beim klassischen Login - "Familie
// verwalten" (FamilyManage). Die Route hat vorher über das AreaGate in diese Familie gewechselt (lib/areas.js settingsArea).
function FamiliesPanel({ family, onFamilyChange, familyParam }) {
  const classic = areaContext(family) === 'classic'
  const managing = classic || (familyParam !== null && familyParam === family.id && family.id !== family.home?.id)
  if (managing) return <FamilyManage key={family.id} family={family} onFamilyChange={onFamilyChange} classic={classic} />
  return <FamilienSection family={family} onFamilyChange={onFamilyChange} />
}

// /einstellungen (Calm-down-Runde) in Zuhause und Familien (nicht in Partner- und Tierheim-Bereichen, nicht zu Besuch):
// alles, was man an sich selbst einstellt, an einer Stelle - Darstellung (Farbpalette, Hell/Dunkel, Schrift), die
// Familien samt der Frage, welche eigenen Tiere wo zu sehen sind, "Familie verwalten" (Phase W, Schritt 2) und das eigene
// Zuhause (Name, Auftritt, Zugang, Einladungen). Die Bereiche als Reiter (TabBar), der gewählte steht in der Adresse.
export default function SettingsPage({ family, onFamilyChange, onInvite }) {
  const { words } = useTheme()
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const sections = sectionsFor(family, words, t)
  const wanted = searchParams.get(BEREICH_PARAM)
  const current = sections.some((section) => section.key === wanted) ? wanted : DARSTELLUNG

  function select(key) {
    setSearchParams(key === DARSTELLUNG ? {} : { [BEREICH_PARAM]: key }, { replace: true })
  }

  return (
    <div className="page settings-page">
      <header className="page-hero settings-hero">
        <div>
          <span className="eyebrow">{family.home?.art === 'zuhause' ? t('settings.tab.zuhause') : family.name}</span>
          <h1>{t('settings.title')}</h1>
          <p className="page-lede">
            {t(family.home?.art === 'zuhause' ? 'settings.lede.home' : 'settings.lede.other', words)}
          </p>
        </div>
      </header>

      {sections.length > 1 && (
        <TabBar
          tabs={sections}
          current={current}
          label={t('settings.tabsLabel')}
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
        {current === 'familien' && (
          <FamiliesPanel family={family} onFamilyChange={onFamilyChange} familyParam={parseAreaId(searchParams.get(SETTINGS_FAMILY_PARAM))} />
        )}
        {current === 'zuhause' && <ZuhauseSection family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />}
        {current === APP && <AppSection />}
      </div>
    </div>
  )
}
