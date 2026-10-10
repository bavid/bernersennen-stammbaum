import { useId } from 'react'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import ShareSwitch from '../shares/ShareSwitch.jsx'
import { WWH, checkinStatusText } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'
import ErinnerungAnheften from './ErinnerungAnheften.jsx'

const STATUS_ICON = { bestaetigt: 'check', abgelehnt: 'close', offen: 'clock' }

// Eine eigene Anmeldung am Ort: Stand (wartet / freigegeben / nicht freigegeben), der Schalter „Hier zeigen“ samt Satz,
// was andere dann sehen, die angehefteten Erinnerungen und „Abmelden“ (zweistufig). readOnly: Demo/Admin-Ansicht;
// busy: eine Änderung läuft (der Schalter bleibt fokussierbar, ShareSwitch).
export default function EigeneAnmeldung({ checkin, ortName, readOnly, busy, actions }) {
  const nameId = useId()
  const status = STATUS_ICON[checkin.status] ? checkin.status : 'offen'
  return (
    <li className={`wwh-own card is-${status}`} aria-labelledby={nameId}>
      <div className="wwh-own-head">
        <h3 id={nameId} className="wwh-own-name">
          {checkin.tierName}
        </h3>
        <p className="wwh-status">
          <Icon name={STATUS_ICON[status]} />
          {checkinStatusText(status, ortName)}
        </p>
      </div>
      {status !== 'abgelehnt' && (
        <ShareSwitch
          label={t(WWH.hierZeigen)}
          hint={t(WWH.zeigenHinweis)}
          checked={Boolean(checkin.zeigeMich)}
          disabled={readOnly}
          busy={busy}
          onChange={(value) => actions.setZeigeMich(checkin, value)}
        />
      )}
      {status !== 'abgelehnt' && (
        <ErinnerungAnheften checkin={checkin} ortName={ortName} disabled={readOnly || busy} onPin={actions.pin} onUnpin={actions.unpin} />
      )}
      <div className="wwh-own-actions">
        <ConfirmButton
          label={WWH.abmelden}
          confirmLabel={WWH.abmeldenFrage}
          ariaLabel={t(WWH.abmeldenLabel, { name: checkin.tierName })}
          icon="close"
          className="btn-compact"
          disabled={readOnly || busy}
          onConfirm={() => actions.withdraw(checkin)}
        />
      </div>
    </li>
  )
}
