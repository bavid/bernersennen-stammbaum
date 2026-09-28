import RenameFamilyForm from './RenameFamilyForm.jsx'
import ThemePicker from './ThemePicker.jsx'

// Einstellungen-Dialog: Name und Aussehen der Familie/des Rudels in einem Modal.
// onRenamed/onChange bekommen jeweils nur die vom Server geänderten Felder (z. B. { id, name, theme });
// wer sie weiterreicht, ist dafür verantwortlich, sie mit der bestehenden family zusammenzuführen (isDemo bleibt sonst verloren).
export default function FamilySettings({ family, onRenamed, onChange, onCancel }) {
  return (
    <div className="family-settings">
      <section className="settings-section">
        <h3>Name</h3>
        <RenameFamilyForm family={family} onRenamed={onRenamed} onCancel={onCancel} />
      </section>
      <section className="settings-section">
        <h3>Aussehen</h3>
        <ThemePicker family={family} onSaved={onChange} />
      </section>
    </div>
  )
}
