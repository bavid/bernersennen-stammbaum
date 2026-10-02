import { useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import { isPartnerArea } from '../lib/areas.js'
import { hasRole, inviteRoleOptions, roleOf } from '../lib/roles.js'
import { isOwnHome } from '../lib/visits.js'
import VisitSection from './visits/VisitSection.jsx'
import VoucherRow from './invite/VoucherRow.jsx'
import VoucherArchive from './invite/VoucherArchive.jsx'
import VoucherCreateBar from './invite/VoucherCreateBar.jsx'
import useVoucherList from './invite/useVoucherList.js'

function CopyField({ label, value }) {
  const toast = useToast()

  async function handleCopy(event) {
    try {
      await navigator.clipboard.writeText(value)
      toast('Kopiert')
    } catch {
      // Ohne Zwischenablage-Recht: Text markieren, damit man ihn selbst kopieren kann
      event.currentTarget.previousElementSibling?.select()
    }
  }

  return (
    <div className="copy-field">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-ghost" onClick={handleCopy}>
        <Icon name="copy" />
        Kopieren
      </button>
    </div>
  )
}

const PARTNER_EXPLANATION =
  'Gebt diesen Gutschein an eure Kundschaft weiter – damit legen sie ihre eigene Chronik bei Familie auf Pfoten an.'

// Rudel: Mitgliedschaft inklusive; Partner/Tierheime (Phase P): Kunden-Gutscheine für die Kundschaft, nie
// ein Beitritt (der Server rechnet sie dem Partner zu, siehe server/lib/vouchers.js ensureVoucherQuota).
function explanationFor(family) {
  if (isPartnerArea(family)) return PARTNER_EXPLANATION
  if (family.art === 'rudel') {
    return `Wer den Gutschein einlöst, bekommt eine eigene Chronik und ist gleich Mitglied in „${family.name}“.`
  }
  return 'Wer den Gutschein einlöst, bekommt eine eigene Chronik.'
}

// Phase V2b: neue Codes anlegen im eigenen Zuhause und in einer Familie ab Stellvertretung (Partner geben
// Kunden-Gutscheine über ihre Stapel weiter); Codes anderer zurückziehen im eigenen Bereich bzw. ab
// Stellvertretung in einer Familie - den eigenen Code immer (voucher.eigen).
function canCreateCodes(family) {
  return isOwnHome(family) || (family.art === 'rudel' && hasRole(family, 'stellvertretung'))
}

function canModerateCodes(family) {
  return family.art === 'rudel' ? hasRole(family, 'stellvertretung') : !family.zuBesuch
}

// Jemanden einladen bzw. (Partner/Tierheim) Kunden-Gutscheine weitergeben: die eigenen Codes des aktiven Bereichs
// (myVouchers() füllt das Kontingent bei jedem Aufruf selbst auf). Phase V2b: eine kleine Liste mit eigener Notiz,
// Status, „Zurückziehen“, „Neuen Code erstellen“ (höchstens 5 offen) und dem Archiv der eingelösten. Der alte Weg
// über Adresse+Passwort bleibt als letzter Abschnitt, aber nur für klassische Rudel mit gemeinsamem Passwort.
// onFamilyChange (Phase V2, optional): neues "me" nach dem Einlösen oder Beenden eines Besuchs (Bereichswechsler).
export default function InviteDialog({ family, onFamilyChange }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  // In der Demo sind die Gutscheine Beispiele; in der Admin-Ansicht sind es die echten des Bereichs - nur vergeben
  // (Rolle ändern, Code weitergeben) geht dort nicht.
  const readOnlyHint = useReadOnlyHint('Beispiel – in der Demo werden keine Gutscheine vergeben.')
  const canCreate = canCreateCodes(family)
  const list = useVoucherList({ withLimit: canCreate })
  const [archiveOpen, setArchiveOpen] = useState(false)
  const { vouchers, error } = list

  // Rolle je Einladung (Phase R): nur in einer Familie, nur was die eigene Rolle vergeben darf.
  const roleOptions = family.art === 'rudel' ? inviteRoleOptions(roleOf(family)) : []
  const canModerate = canModerateCodes(family)

  return (
    <div className="invite">
      <section className="invite-vouchers">
        <h3>Gutscheine</h3>
        <p className="muted">{explanationFor(family)}</p>
        {isDemo && <p className="field-hint">{readOnlyHint}</p>}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {canCreate && <VoucherCreateBar limit={list.limit} busy={list.creating} disabled={isDemo} onCreate={list.create} />}
        {vouchers === undefined && !error && <p className="muted">Lade …</p>}
        {vouchers && vouchers.length === 0 && <p className="muted">Gerade keine Gutscheine übrig.</p>}
        {vouchers && vouchers.length > 0 && (
          <ul className="voucher-list">
            {vouchers.map((voucher) => (
              <VoucherRow
                key={voucher.id}
                voucher={voucher}
                roleOptions={roleOptions}
                onRoleChange={list.setRole}
                onLabelChange={list.setLabel}
                onDelete={list.remove}
                canDelete={voucher.eigen || canModerate}
                disabled={isDemo}
              />
            ))}
          </ul>
        )}
        <VoucherArchive
          entries={list.archive}
          open={archiveOpen}
          onToggle={() => setArchiveOpen((value) => !value)}
          own={isOwnHome(family)}
          onLabelChange={list.setLabel}
          disabled={isDemo}
        />
      </section>

      {/* Phase V2: Zuhause besuchen - nur im eigenen Zuhause (nicht in einer Familie, nicht zu Besuch). */}
      {isOwnHome(family) && <VisitSection onFamilyChange={onFamilyChange} onInviteCreated={list.reload} />}

      {family.art === 'rudel' && (
        <section className="invite-legacy">
          <h3>Adresse und Passwort weitergeben</h3>
          <p className="muted">
            Schick der Person die Adresse und euer gemeinsames {words.groupPassword}. Dann sieht sie {words.yourTreeAcc} und
            kann mitschreiben. Das Passwort schreibst du selbst dazu – es ist aus Sicherheitsgründen nirgends gespeichert.
          </p>
          <CopyField label="Adresse der Chronik" value={window.location.origin} />
        </section>
      )}
    </div>
  )
}
