import { useState } from 'react'
import { useReadOnlyHint } from '../../lib/demo.js'
import Icon from '../Icon.jsx'
import RenameFamilyForm from '../RenameFamilyForm.jsx'
import AccessSettings from '../AccessSettings.jsx'

// Gemeinsame Abschnitte der Einstellungen (Mein Zuhause und Familie verwalten, Phase W Schritt 2).

// Name mit "Umbenennen" (RenameFamilyForm erst auf Klick - das Formular holt sich den Fokus). sub: kurze Erklärung.
export function NameGroup({ family, readOnly, onRenamed, sub = 'So sehen euch andere, z. B. bei geteilten Tieren.' }) {
  const [renaming, setRenaming] = useState(false)

  function handleRenamed(renamed) {
    setRenaming(false)
    onRenamed(renamed)
  }

  return (
    <section className="settings-group" aria-labelledby="settings-name-title">
      <h2 id="settings-name-title">Name</h2>
      {renaming ? (
        <RenameFamilyForm family={family} onRenamed={handleRenamed} onCancel={() => setRenaming(false)} />
      ) : (
        <div className="settings-row settings-row-plain">
          <div className="settings-row-main">
            <strong>{family.name}</strong>
            <span className="settings-row-sub">{sub}</span>
          </div>
          <div className="settings-row-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setRenaming(true)} disabled={readOnly}>
              <Icon name="edit" />
              Umbenennen
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// Schlüssel und Benutzer (AccessSettings) erst auf Klick - es lädt beim Öffnen die Benutzer.
export function AccessGroup({ family, readOnly, onFamilyChange }) {
  const readOnlyHint = useReadOnlyHint()
  const [open, setOpen] = useState(false)
  return (
    <section className="settings-group" aria-labelledby="settings-zugang-title">
      <h2 id="settings-zugang-title">Schlüssel und Benutzer</h2>
      {readOnly ? (
        <p className="muted">{readOnlyHint}</p>
      ) : (
        <>
          <p className="muted">Den Schlüssel erneuern, wenn ihn jemand Falsches kennt, und eigene Logins für einzelne Personen.</p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-ghost"
              aria-expanded={open}
              aria-controls="settings-zugang-panel"
              onClick={() => setOpen(!open)}
            >
              <Icon name="lock" />
              {open ? 'Schließen' : 'Schlüssel und Benutzer verwalten'}
            </button>
          </div>
          <div id="settings-zugang-panel" hidden={!open}>
            {open && <AccessSettings family={family} onFamilyChange={onFamilyChange} title="Zugang" />}
          </div>
        </>
      )}
    </section>
  )
}

