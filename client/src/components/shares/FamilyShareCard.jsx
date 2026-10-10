import { useId } from 'react'
import { displayName } from '../../lib/timeline.js'
import ShareSwitch from './ShareSwitch.jsx'
import { t } from '../../lib/i18n/index.js'

export const GUEST_SHARE_HINT = 'Als Gast teilt ihr hier keine Tiere'

// Einstellungen › Familien (Phase W, Schritt 2): je Familie eine Karte "In Familie Sonnenhang zeigt ihr:" mit einem Schalter
// je eigenem Tier. Als Gast teilt man nichts Neues (der Server sagt sonst 403) - eine bestehende Freigabe lässt sich
// trotzdem lösen. matrix: hooks/useShareMatrix.js.
export default function FamilyShareCard({ membership, animals, matrix, readOnly, describedBy }) {
  const titleId = useId()
  return (
    <section className="share-card" aria-labelledby={titleId}>
      <h3 id={titleId} className="share-card-title">
        {t('In {name} zeigt ihr:', { name: membership.name })}
      </h3>
      <ul className="share-switches" role="list">
        {animals.map((dog) => {
          const checked = matrix.sharesOf(dog.id).includes(membership.id)
          const guestOnly = membership.rolle === 'gast' && !checked
          return (
            <li key={dog.id}>
              <ShareSwitch
                label={dog.name_unbekannt ? t('Ohne Namen') : displayName(dog)}
                checked={checked}
                disabled={readOnly || guestOnly}
                busy={matrix.isSaving(dog.id)}
                hint={guestOnly ? t(GUEST_SHARE_HINT) : null}
                describedBy={describedBy}
                onChange={(next) => matrix.toggle(dog.id, membership.id, next)}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
