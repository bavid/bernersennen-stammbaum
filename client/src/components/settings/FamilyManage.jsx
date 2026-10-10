import { startTransition, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { SETTINGS_ROUTE, startRoute } from '../../lib/areas.js'
import useFamilyMembers from '../../hooks/useFamilyMembers.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import RoleBadge from '../RoleBadge.jsx'
import HandOverSection from '../members/HandOverSection.jsx'
import FamilyKeySection from '../members/FamilyKeySection.jsx'
import OwnMembershipSection from '../members/OwnMembershipSection.jsx'
import DissolveFamilyDialog from '../members/DissolveFamilyDialog.jsx'
import { AccessGroup, NameGroup } from './SettingsGroups.jsx'
import { AreaBildGroup, PersonNameGroup } from './ProfilGroups.jsx'
import { useT } from '../../lib/i18n/index.js'

function DissolveGroup({ disabled, onOpen }) {
  const { words } = useTheme()
  const t = useT()
  return (
    <section className="card members-section members-danger" aria-labelledby="dissolve-title">
      <h2 id="dissolve-title">{words.dissolveGroup}</h2>
      <p className="muted">{t('settings.manage.dissolveText', { ...words, tree: words.treeLabel })}</p>
      <button type="button" className="btn btn-danger" disabled={disabled} onClick={onOpen}>
        <Icon name="trash" />
        {words.dissolveGroup} …
      </button>
    </section>
  )
}

// Einstellungen › Familien › [Familie] (Phase W, Schritt 2 - ersetzt den Dialog "Familie einstellen" und die Leitungs-Teile
// des Reiters "Mitglieder"): der Name (Leitung), beim klassischen Login Schlüssel und Benutzer, Leitung übergeben,
// den Schlüssel der Familie erneuern, die eigene Mitgliedschaft (Verlassen) und Auflösen. Die Seite läuft im Bereich der
// Familie (AreaGate über ?familie=, lib/areas.js settingsArea) - die Endpunkte wirken auf den aktiven Bereich, die Rollen
// prüft der Server. classic: Anmeldung mit dem gemeinsamen Schlüssel (die Familie ist selbst die Identität).
export default function FamilyManage({ family, onFamilyChange, classic = false }) {
  const { words } = useTheme()
  const t = useT()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const navigate = useNavigate()
  const members = useFamilyMembers(family, onFamilyChange)
  const { data, isLeitung, isHousehold } = members
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const handOverRef = useRef(null)

  // RenameFamilyForm liefert nur die geänderten Felder - mit family zusammenführen; der Name steht auch in
  // me.memberships (Familien-Liste, Einstellungen).
  function handleRenamed(renamed) {
    const memberships = (family.memberships || []).map((m) => (m.id === family.id ? { ...m, name: renamed.name } : m))
    onFamilyChange({ ...family, ...renamed, memberships })
    toast(t('settings.manage.renamed', { ...words, name: renamed.name }))
  }

  const handleHandOver = (member) => members.run(() => api.handOverLeitung(member.familyId), t('settings.manage.newLeader', { name: member.name }))

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
    toast(t('settings.manage.dissolved', { name: family.name }))
  }

  return (
    <div className="settings-block family-manage">
      <div className="family-manage-head">
        {!classic && (
          <Link to={`${SETTINGS_ROUTE}?bereich=familien`} className="back-link">
            <Icon name="arrowLeft" /> {t('settings.manage.all', words)}
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
        <NameGroup family={family} readOnly={isDemo} onRenamed={handleRenamed} sub={t('settings.manage.nameSub', words)} />
      ) : (
        <section className="settings-group" aria-labelledby="family-readonly-title">
          <h2 id="family-readonly-title">{words.groupName}</h2>
          <p className="muted settings-readonly-hint">{t('settings.manage.nameReadonly', { ...words, leitung: words.roleLeitung })}</p>
        </section>
      )}

      {/* Profil: Bild der Familie (ändert die Leitung); beim klassischen Login ist die Familie selbst die Identität - dort
          steht auch „Euer Name“ (server/lib/profil.js). */}
      <AreaBildGroup family={family} kind="family" canEdit={isLeitung} readOnly={isDemo} onFamilyChange={onFamilyChange} />
      {classic && <PersonNameGroup family={family} readOnly={isDemo} onFamilyChange={onFamilyChange} />}
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
