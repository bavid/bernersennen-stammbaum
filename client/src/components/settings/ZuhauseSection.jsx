import { useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { isOwnHome } from '../../lib/visits.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import RenameFamilyForm from '../RenameFamilyForm.jsx'
import ThemePicker from '../ThemePicker.jsx'
import AccessSettings from '../AccessSettings.jsx'
import HomeSwitchNotice from './HomeSwitchNotice.jsx'

function NameGroup({ family, readOnly, onRenamed }) {
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
            <span className="settings-row-sub">So sehen euch andere, z. B. bei geteilten Tieren.</span>
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
function AccessGroup({ family, readOnly, onFamilyChange }) {
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

// Einstellungen → Mein Zuhause: Name (RenameFamilyForm, erst auf Klick - das Formular holt sich den Fokus), Auftritt
// (ThemePicker: Logo und Wörter), Schlüssel und Benutzer (AccessSettings) und die Einladungen (der bekannte Dialog aus dem
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
          Name, Auftritt, Schlüssel und Einladungen eures Zuhauses stellt ihr in „Meiner Chronik“ ein.
        </HomeSwitchNotice>
      </div>
    )
  }

  // RenameFamilyForm/ThemePicker liefern nur die geänderten Felder - mit family zusammenführen (isDemo, home …
  // blieben sonst weg). Der Bereichswechsler zeigt den Namen des Zuhauses als Zusatz: home zieht mit.
  function handleRenamed(renamed) {
    onFamilyChange({ ...family, ...renamed, home: { ...family.home, name: renamed.name } })
    toast(`Euer Zuhause heißt jetzt „${renamed.name}“`)
  }

  function handleThemeSaved(updated) {
    onFamilyChange({ ...family, ...updated })
    toast('Neuer Auftritt gespeichert')
  }

  return (
    <div className="settings-block">
      <NameGroup family={family} readOnly={readOnly} onRenamed={handleRenamed} />
      <section className="settings-group" aria-labelledby="settings-auftritt-title">
        <h2 id="settings-auftritt-title">Auftritt</h2>
        <p className="muted">Logo und Wörter – ob ihr von „{words.group}“ sprecht. Die Farben wählt ihr unter „Darstellung“.</p>
        <ThemePicker family={family} onSaved={handleThemeSaved} headingId="settings-auftritt-title" />
      </section>
      <AccessGroup family={family} readOnly={readOnly} onFamilyChange={onFamilyChange} />
      <section className="settings-group" aria-labelledby="settings-einladen-title">
        <h2 id="settings-einladen-title">Einladungen</h2>
        <p className="muted">Einladungscodes für Freunde und Familie, Besuchs-Einladungen und eure offenen Codes.</p>
        <div className="settings-actions">
          <button type="button" className="btn btn-ghost" onClick={onInvite}>
            <Icon name="send" />
            Jemanden einladen
          </button>
        </div>
      </section>
    </div>
  )
}
