import { startTransition, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { getTheme } from '../../themes/index.js'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { SETTINGS_ROUTE, startRoute } from '../../lib/areas.js'
import useFamilyMembers from '../../hooks/useFamilyMembers.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import RoleBadge from '../RoleBadge.jsx'
import ThemePicker from '../ThemePicker.jsx'
import HandOverSection from '../members/HandOverSection.jsx'
import FamilyKeySection from '../members/FamilyKeySection.jsx'
import OwnMembershipSection from '../members/OwnMembershipSection.jsx'
import DissolveFamilyDialog from '../members/DissolveFamilyDialog.jsx'
import { AccessGroup, NameGroup } from './SettingsGroups.jsx'

// Aussehen (ThemePicker) erst auf Klick - die Vorschau wechselt sonst schon beim Öffnen der Seite.
function LookGroup({ family, onSaved }) {
  const { words } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <section className="settings-group" aria-labelledby="family-look-title">
      <h2 id="family-look-title">Aussehen</h2>
      <div className="settings-row settings-row-plain">
        <div className="settings-row-main">
          <strong>{getTheme(family.theme).label}</strong>
          <span className="settings-row-sub">Logo und Wörter für alle in {words.yourGroupDat}.</span>
        </div>
        <div className="settings-row-actions">
          <button type="button" className="btn btn-ghost" aria-expanded={open} aria-controls="family-look-panel" onClick={() => setOpen(!open)}>
            <Icon name="edit" />
            {open ? 'Schließen' : 'Ändern'}
          </button>
        </div>
      </div>
      <div id="family-look-panel" hidden={!open}>
        {open && <ThemePicker family={family} onSaved={onSaved} headingId="family-look-title" />}
      </div>
    </section>
  )
}

function DissolveGroup({ disabled, onOpen }) {
  const { words } = useTheme()
  return (
    <section className="card members-section members-danger" aria-labelledby="dissolve-title">
      <h2 id="dissolve-title">{words.dissolveGroup}</h2>
      <p className="muted">
        Löscht {words.theGroup} mit {words.treeLabel}, Pinnwand und Einladungen. Geht nur, wenn {words.theGroup} keine eigenen
        Tiere mehr hat – die übernimmst du vorher in „Mein Zuhause“.
      </p>
      <button type="button" className="btn btn-danger" disabled={disabled} onClick={onOpen}>
        <Icon name="trash" />
        {words.dissolveGroup} …
      </button>
    </section>
  )
}

// Einstellungen › Familien › [Familie] (Phase W, Schritt 2 - ersetzt den Dialog "Familie einstellen" und die Leitungs-Teile
// des Reiters "Mitglieder"): Name und Aussehen (Leitung), beim klassischen Login Schlüssel und Benutzer, Leitung übergeben,
// den Schlüssel der Familie erneuern, die eigene Mitgliedschaft (Verlassen) und Auflösen. Die Seite läuft im Bereich der
// Familie (AreaGate über ?familie=, lib/areas.js settingsArea) - die Endpunkte wirken auf den aktiven Bereich, die Rollen
// prüft der Server. classic: Anmeldung mit dem gemeinsamen Schlüssel (die Familie ist selbst die Identität).
export default function FamilyManage({ family, onFamilyChange, classic = false }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const navigate = useNavigate()
  const members = useFamilyMembers(family, onFamilyChange)
  const { data, isLeitung, isHousehold } = members
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const handOverRef = useRef(null)

  // RenameFamilyForm/ThemePicker liefern nur die geänderten Felder - mit family zusammenführen; der Name steht auch in
  // me.memberships (Familien-Liste, Einstellungen).
  function handleRenamed(renamed) {
    const memberships = (family.memberships || []).map((m) => (m.id === family.id ? { ...m, name: renamed.name } : m))
    onFamilyChange({ ...family, ...renamed, memberships })
    toast(`${words.TheGroup} heißt jetzt „${renamed.name}“`)
  }

  function handleThemeSaved(updated) {
    onFamilyChange({ ...family, ...updated })
    toast('Neues Aussehen gespeichert')
  }

  const handleHandOver = (member) => members.run(() => api.handOverLeitung(member.familyId), `„${member.name}“ hat jetzt die Leitung.`)

  // "Übergib zuerst die Leitung" (einzige Leitung): zur Auswahl darüber springen.
  function focusHandOver() {
    handOverRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    handOverRef.current?.focus()
  }

  // Aufgelöst: ein Mitglied landet in seinem Zuhause (me), der gemeinsame Schlüssel verliert seine Sitzung. Wie beim
  // Verlassen in einer Transition - kein vergeblicher Wechsel zurück durch das AreaGate.
  function handleDissolved(me) {
    setDissolveOpen(false)
    if (!me) {
      window.location.assign('/')
      return
    }
    startTransition(() => {
      onFamilyChange?.(me)
      navigate(startRoute(me))
    })
    toast(`„${family.name}“ wurde aufgelöst.`)
  }

  return (
    <div className="settings-block family-manage">
      <div className="family-manage-head">
        {!classic && (
          <Link to={`${SETTINGS_ROUTE}?bereich=familien`} className="back-link">
            <Icon name="arrowLeft" /> Alle {words.groups}
          </Link>
        )}
        <span className="eyebrow">{words.groupSettings}</span>
        <h2 className="family-manage-title">
          {family.name} <RoleBadge rolle={members.myRole} />
        </h2>
        {isDemo && <p className="field-hint">{readOnlyHint}</p>}
      </div>

      {members.error && (
        <div className="error-banner" role="alert">
          {members.error}
        </div>
      )}

      {isLeitung ? (
        <>
          <NameGroup family={family} readOnly={isDemo} onRenamed={handleRenamed} sub={`So heißt ${words.theGroup} für alle Mitglieder.`} />
          <LookGroup family={family} onSaved={handleThemeSaved} />
        </>
      ) : (
        <section className="settings-group" aria-labelledby="family-readonly-title">
          <h2 id="family-readonly-title">Name und Aussehen</h2>
          <p className="muted settings-readonly-hint">
            Name und Aussehen {words.ofGroup} ändert nur die {words.roleLeitung}. Wer das ist, steht im Reiter „Mitglieder“.
          </p>
        </section>
      )}

      {classic && <AccessGroup family={family} readOnly={isDemo} onFamilyChange={onFamilyChange} />}

      {isLeitung && data && (
        <HandOverSection
          ref={handOverRef}
          members={members.mitglieder}
          selfId={members.selfId}
          selfDemoted={isHousehold}
          disabled={isDemo}
          onHandOver={handleHandOver}
        />
      )}
      {isLeitung && isHousehold && data && <FamilyKeySection family={family} disabled={isDemo} />}
      {isHousehold && data && (
        <OwnMembershipSection
          family={family}
          lastLeitung={members.lastLeitung}
          disabled={isDemo}
          onFamilyChange={onFamilyChange}
          onHandOver={focusHandOver}
          onDissolve={() => setDissolveOpen(true)}
        />
      )}
      {isLeitung && data && <DissolveGroup disabled={isDemo} onOpen={() => setDissolveOpen(true)} />}

      <Modal open={dissolveOpen} title={words.dissolveGroup} onClose={() => setDissolveOpen(false)}>
        {dissolveOpen && <DissolveFamilyDialog family={family} onDissolved={handleDissolved} onClose={() => setDissolveOpen(false)} />}
      </Modal>
    </div>
  )
}
