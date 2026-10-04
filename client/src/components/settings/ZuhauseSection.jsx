import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo } from '../../lib/demo.js'
import { isOwnHome } from '../../lib/visits.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import HomeSwitchNotice from './HomeSwitchNotice.jsx'
import RahmenGeraete from './RahmenGeraete.jsx'
import { AccessGroup, NameGroup } from './SettingsGroups.jsx'
import VisitSection from '../visits/VisitSection.jsx'

// Einstellungen → Mein Zuhause: Name (RenameFamilyForm, erst auf Klick - das Formular holt sich den Fokus), Schlüssel und
// Benutzer (AccessSettings) und die Einladungen (der bekannte Dialog aus dem
// Fuß, onInvite). Das alles betrifft das eigene Zuhause und geht nur, solange es aktiv ist (der Server ändert immer den
// aktiven Bereich) - aus einer Familie heraus steht stattdessen der Weg dorthin.
export default function ZuhauseSection({ family, onFamilyChange, onInvite }) {
  const { words } = useTheme()
  const readOnly = useIsDemo()
  const toast = useToast()

  if (!isOwnHome(family)) {
    return (
      <div className="settings-block">
        <HomeSwitchNotice family={family} onFamilyChange={onFamilyChange}>
          Name, Schlüssel und Einladungen eures Zuhauses stellt ihr in „Mein Zuhause“ ein.
        </HomeSwitchNotice>
      </div>
    )
  }

  // RenameFamilyForm liefert nur die geänderten Felder - mit family zusammenführen (isDemo, home …
  // blieben sonst weg). Der Bereichswechsler zeigt den Namen des Zuhauses als Zusatz: home zieht mit.
  function handleRenamed(renamed) {
    onFamilyChange({ ...family, ...renamed, home: { ...family.home, name: renamed.name } })
    toast(`Euer Zuhause heißt jetzt „${renamed.name}“`)
  }

  return (
    <div className="settings-block">
      <NameGroup family={family} readOnly={readOnly} onRenamed={handleRenamed} />
      <AccessGroup family={family} readOnly={readOnly} onFamilyChange={onFamilyChange} />
      <section className="settings-group" aria-labelledby="settings-einladen-title">
        <h2 id="settings-einladen-title">Einladungen</h2>
        <p className="muted">Freunde zu Besuch einladen oder ein Zuhause verschenken – dort stehen auch eure offenen Codes.</p>
        <div className="settings-actions">
          <button type="button" className="btn btn-ghost" onClick={onInvite}>
            <Icon name="send" />
            Einladen
          </button>
        </div>
      </section>
      {/* Phase W, Schritt 2: Besuche und Gäste gehören zum eigenen Zuhause (vorher unter "Familien"). */}
      <section className="settings-group" aria-labelledby="settings-besuche-title">
        <h2 id="settings-besuche-title">Befreundete Zuhause</h2>
        <p className="muted">Wen ihr besucht und wer bei euch zu Gast ist. Einen Code von Freunden gebt ihr unter „{words.groups}“ ein.</p>
        <VisitSection onFamilyChange={onFamilyChange} />
      </section>
      {/* Digitaler Bilderrahmen: Rahmen-Links für Omas Tablet & Co., ohne Anmeldung, jederzeit zu beenden. */}
      <RahmenGeraete />
    </div>
  )
}
