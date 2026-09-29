import { Link } from 'react-router-dom'
import RenameFamilyForm from './RenameFamilyForm.jsx'
import ThemePicker from './ThemePicker.jsx'
import LeaveFamilySection from './LeaveFamilySection.jsx'
import AccessSettings from './AccessSettings.jsx'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo } from '../lib/demo.js'
import { hasRole } from '../lib/roles.js'

// Einstellungen-Dialog: Name und Aussehen der Familie/des Rudels in einem Modal.
// onRenamed/onChange bekommen jeweils nur die vom Server geänderten Felder (z. B. { id, name, theme });
// wer sie weiterreicht, ist dafür verantwortlich, sie mit der bestehenden family zusammenzuführen (isDemo bleibt sonst verloren).
// onFamilyChange (optional): volles "me"-Objekt fürs Verlassen einer Familie – anders als onChange/onRenamed
// kein Patch zum Zusammenführen, sondern der komplette neue Bereich (man landet wieder im eigenen Zuhause).
// Der Abschnitt "<Familie/Rudel> verlassen" erscheint nur, wenn die eigene Identität ein Zuhause ist und
// gerade eine beigetretene Familie aktiv ist – niemals in der Demo.
// Rollen (Phase R): in einer Familie ändern nur die Leitung Name und Aussehen - alle anderen sehen statt der
// Formulare einen Hinweis. Benutzer und den eigenen Schlüssel verwaltet ein Haushalt in „Meine Chronik“,
// den Schlüssel der Familie die Leitung auf der Mitglieder-Seite (/mitglieder), die hier verlinkt ist.
export default function FamilySettings({ family, onRenamed, onChange, onFamilyChange, onCancel }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const inGroup = family.art === 'rudel'
  const isHousehold = family.home?.art === 'zuhause'
  const canLeave = inGroup && isHousehold && !isDemo
  const isIdentityActive = family.id === family.home?.id
  const isLeitung = hasRole(family, 'leitung')
  return (
    <div className="family-settings">
      {!inGroup || isLeitung ? (
        <>
          <section className="settings-section">
            <h3>Name</h3>
            <RenameFamilyForm family={family} onRenamed={onRenamed} onCancel={onCancel} />
          </section>
          <section className="settings-section">
            <h3 id="family-settings-theme-heading">Aussehen</h3>
            <ThemePicker family={family} onSaved={onChange} headingId="family-settings-theme-heading" />
          </section>
        </>
      ) : (
        <section className="settings-section">
          <h3>Name und Aussehen</h3>
          <p className="muted settings-readonly-hint">
            Name und Aussehen {words.ofGroup} ändert nur die {words.roleLeitung}. Wer das gerade ist, steht auf der
            Mitglieder-Seite.
          </p>
        </section>
      )}
      {isIdentityActive && !isDemo && <AccessSettings family={family} onFamilyChange={onFamilyChange} />}
      {inGroup && isHousehold && (
        <section className="settings-section">
          <h3>Zugang</h3>
          <p className="muted">Benutzer verwaltest du in „Meine Chronik“.</p>
          {isLeitung && (
            <p className="muted">
              Den Schlüssel {words.ofGroup} erneuerst du auf der Mitglieder-Seite.
            </p>
          )}
        </section>
      )}
      {inGroup && (
        <section className="settings-section">
          <h3>Mitglieder</h3>
          <p className="muted">Wer dazugehört, welche Rolle wer hat und wer einladen darf.</p>
          <Link to="/mitglieder" className="btn btn-ghost settings-members-link" onClick={onCancel}>
            <Icon name="users" />
            Mitglieder & Rollen
          </Link>
        </section>
      )}
      {canLeave && <LeaveFamilySection family={family} onFamilyChange={onFamilyChange} onLeft={onCancel} />}
    </div>
  )
}
