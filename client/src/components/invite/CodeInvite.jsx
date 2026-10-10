import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { isPartnerArea } from '../../lib/areas.js'
import { hasRole, inviteRoleOptions, roleOf } from '../../lib/roles.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import CodeList from './CodeList.jsx'
import useVoucherList from './useVoucherList.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

function CopyField({ label, value }) {
  const toast = useToast()

  async function handleCopy(event) {
    try {
      await navigator.clipboard.writeText(value)
      toast(t('Kopiert'))
    } catch {
      // Ohne Zwischenablage-Recht: Text markieren, damit man ihn selbst kopieren kann
      event.currentTarget.previousElementSibling?.select()
    }
  }

  return (
    <div className="copy-field">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <Button type="button" variant="ghost" onClick={handleCopy}>
        <Icon name="copy" />
        {t('Kopieren')}
      </Button>
    </div>
  )
}

const PARTNER_EXPLANATION =
  'Gebt diesen Einladungscode an eure Kundschaft weiter – damit legen sie ihr eigenes Zuhause bei Familie auf Pfoten an.'

// Familie: Mitgliedschaft inklusive; Partner/Tierheime (Phase P): Kunden-Gutscheine für die Kundschaft, nie ein Beitritt
// (der Server rechnet sie dem Partner zu, siehe server/lib/vouchers.js ensureVoucherQuota).
function explanationFor(family) {
  if (isPartnerArea(family)) return t(PARTNER_EXPLANATION)
  return t('Wer den Einladungscode einlöst, bekommt ein eigenes Zuhause und ist gleich Mitglied in „{name}“.', { name: family.name })
}

// "Mitglied einladen" (Familie, ab Stellvertretung neue Codes und fremde zurückziehen) bzw. "Einladungscode weitergeben"
// (Partner und Tierheime): die Codes des aktiven Bereichs - in einer Familie mit Rolle je Einladung (Phase R). Der alte Weg
// über Adresse und Passwort bleibt als letzter Abschnitt, aber nur für Familien mit gemeinsamem Passwort.
export default function CodeInvite({ family }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  // In der Demo sind die Codes Beispiele; in der Admin-Ansicht sind es die echten des Bereichs - nur vergeben geht dort nicht.
  const readOnlyHint = useReadOnlyHint(t('Beispiel – in der Demo werden keine Einladungscodes vergeben.'))
  const inGroup = family.art === 'rudel'
  const canCreate = inGroup && hasRole(family, 'stellvertretung')
  const list = useVoucherList({ withLimit: canCreate })

  return (
    <div className="invite">
      <section className="invite-vouchers">
        <h3>{t('Einladungscodes')}</h3>
        <p className="muted">{explanationFor(family)}</p>
        {isDemo && <p className="field-hint">{readOnlyHint}</p>}
        <CodeList
          list={list}
          vouchers={list.vouchers}
          archive={list.archive}
          canCreate={canCreate}
          roleOptions={inGroup ? inviteRoleOptions(roleOf(family)) : []}
          canModerate={inGroup ? hasRole(family, 'stellvertretung') : true}
          own={false}
          disabled={isDemo}
          emptyText={t('Gerade keine Einladungscodes übrig.')}
        />
      </section>

      {inGroup && (
        <section className="invite-legacy">
          <h3>{t('Adresse und Passwort weitergeben')}</h3>
          <p className="muted">
            {t('Schick der Person die Adresse und euer gemeinsames {password}. Dann sieht sie {tree} und kann mitschreiben. Das Passwort schreibst du selbst dazu – es ist aus Sicherheitsgründen nirgends gespeichert.', {
              password: words.groupPassword,
              tree: words.yourTreeAcc
            })}
          </p>
          <CopyField label={t('Adresse der Chronik')} value={window.location.origin} />
        </section>
      )}
    </div>
  )
}
