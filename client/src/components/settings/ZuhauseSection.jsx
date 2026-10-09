import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo } from '../../lib/demo.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import RahmenGeraete from './RahmenGeraete.jsx'
import { AccessGroup, NameGroup } from './SettingsGroups.jsx'
import VisitSection from '../visits/VisitSection.jsx'
import { useT } from '../../lib/i18n/index.js'

// Einstellungen → Mein Zuhause: Name (RenameFamilyForm, erst auf Klick - das Formular holt sich den Fokus), Schlüssel und
// Benutzer (AccessSettings) und die Einladungen (der bekannte Dialog aus dem
// Fuß, onInvite). Das alles betrifft das eigene Zuhause und geht nur, solange es aktiv ist (der Server ändert immer den
// aktiven Bereich) - dorthin wechselt das AreaGate der Route (AreaRoutes SettingsRoute) vorher.
export default function ZuhauseSection({ family, onFamilyChange, onInvite }) {
  const { words } = useTheme()
  const t = useT()
  const readOnly = useIsDemo()
  const toast = useToast()

  // RenameFamilyForm liefert nur die geänderten Felder - mit family zusammenführen (isDemo, home …
  // blieben sonst weg). Der Bereichswechsler zeigt den Namen des Zuhauses als Zusatz: home zieht mit.
  function handleRenamed(renamed) {
    onFamilyChange({ ...family, ...renamed, home: { ...family.home, name: renamed.name } })
    toast(t('settings.home.renamed', { name: renamed.name }))
  }

  return (
    <div className="settings-block">
      <NameGroup family={family} readOnly={readOnly} onRenamed={handleRenamed} />
      <AccessGroup family={family} readOnly={readOnly} onFamilyChange={onFamilyChange} />
      <section className="settings-group" aria-labelledby="settings-einladen-title">
        <h2 id="settings-einladen-title">{t('settings.home.invite.title')}</h2>
        <p className="muted">{t('settings.home.invite.lede')}</p>
        <div className="settings-actions">
          <button type="button" className="btn btn-ghost" onClick={onInvite}>
            <Icon name="send" />
            {t('settings.home.invite.button')}
          </button>
        </div>
      </section>
      {/* Phase W, Schritt 2: Besuche und Gäste gehören zum eigenen Zuhause (vorher unter "Familien"). */}
      <section className="settings-group" aria-labelledby="settings-besuche-title">
        <h2 id="settings-besuche-title">{t('settings.home.friends.title')}</h2>
        <p className="muted">{t('settings.home.friends.lede', words)}</p>
        <VisitSection onFamilyChange={onFamilyChange} />
      </section>
      {/* Digitaler Bilderrahmen: Rahmen-Links für Omas Tablet & Co., ohne Anmeldung, jederzeit zu beenden. */}
      <RahmenGeraete />
    </div>
  )
}
