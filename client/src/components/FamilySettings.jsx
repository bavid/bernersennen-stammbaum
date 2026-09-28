import RenameFamilyForm from './RenameFamilyForm.jsx'
import ThemePicker from './ThemePicker.jsx'
import LeaveFamilySection from './LeaveFamilySection.jsx'
import { useIsDemo } from '../lib/demo.js'

// Einstellungen-Dialog: Name und Aussehen der Familie/des Rudels in einem Modal.
// onRenamed/onChange bekommen jeweils nur die vom Server geänderten Felder (z. B. { id, name, theme });
// wer sie weiterreicht, ist dafür verantwortlich, sie mit der bestehenden family zusammenzuführen (isDemo bleibt sonst verloren).
// onFamilyChange (optional): volles "me"-Objekt fürs Verlassen einer Familie – anders als onChange/onRenamed
// kein Patch zum Zusammenführen, sondern der komplette neue Bereich (man landet wieder im eigenen Zuhause).
// Der Abschnitt "<Familie/Rudel> verlassen" erscheint nur, wenn die eigene Identität ein Zuhause ist und
// gerade eine beigetretene Familie aktiv ist – niemals in der Demo.
export default function FamilySettings({ family, onRenamed, onChange, onFamilyChange, onCancel }) {
  const isDemo = useIsDemo()
  const canLeave = family.art === 'rudel' && family.home?.art === 'zuhause' && !isDemo
  return (
    <div className="family-settings">
      <section className="settings-section">
        <h3>Name</h3>
        <RenameFamilyForm family={family} onRenamed={onRenamed} onCancel={onCancel} />
      </section>
      <section className="settings-section">
        <h3 id="family-settings-theme-heading">Aussehen</h3>
        <ThemePicker family={family} onSaved={onChange} headingId="family-settings-theme-heading" />
      </section>
      {canLeave && <LeaveFamilySection family={family} onFamilyChange={onFamilyChange} onLeft={onCancel} />}
    </div>
  )
}
