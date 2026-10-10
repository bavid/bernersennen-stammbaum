import { useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { displayName } from '../lib/timeline.js'
import useShareMatrix from '../hooks/useShareMatrix.js'
import Modal from './Modal.jsx'
import JoinFamilyDialog from './JoinFamilyDialog.jsx'
import ShareNote from './shares/ShareNote.jsx'
import ShareSwitch from './shares/ShareSwitch.jsx'
import { GUEST_SHARE_HINT } from './shares/FamilyShareCard.jsx'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const DEMO_HINT_ID = 'share-panel-demo-hint'
const NOTE_ID = 'share-panel-note'

// "Wer sieht {Name}?" (Phase W, Reiter "Infos" der Tierseite; früher "In Familien zeigen"): nur für den eigenen Haushalt
// ("Mein Zuhause"), auf einem seiner Tiere - ein Schalter je Familie, in der der Haushalt Mitglied ist, darunter derselbe
// Satz wie in Einstellungen › Familien (ShareNote). Speichern, Zurücknehmen bei Fehlern und das Sperren während einer
// laufenden Änderung übernimmt useShareMatrix. onSharesChange (optional): die gespeicherten Freigaben für die Seite.
export default function SharePanel({ dog, family, onFamilyChange, onSharesChange }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const matrix = useShareMatrix([dog], (_dogId, shares) => onSharesChange?.(shares))
  const [joinOpen, setJoinOpen] = useState(false)
  const name = dog.name_unbekannt ? words.animal : displayName(dog)
  const shares = matrix.sharesOf(dog.id)

  return (
    <section className="share-panel" aria-labelledby="share-panel-title">
      <h2 id="share-panel-title" tabIndex={-1}>
        {t('Wer sieht {name}?', { name })}
      </h2>

      {family.memberships.length > 0 ? (
        <>
          <ul className="share-switches share-panel-list" role="list" aria-label={t('{name} zeigen in', { name })}>
            {family.memberships.map((membership) => {
              const checked = shares.includes(membership.id)
              const guestOnly = membership.rolle === 'gast' && !checked
              return (
                <li key={membership.id}>
                  <ShareSwitch
                    label={membership.name}
                    checked={checked}
                    disabled={isDemo || guestOnly}
                    busy={matrix.isSaving(dog.id)}
                    hint={guestOnly ? t(GUEST_SHARE_HINT) : null}
                    describedBy={isDemo ? `${NOTE_ID} ${DEMO_HINT_ID}` : NOTE_ID}
                    onChange={(next) => matrix.toggle(dog.id, membership.id, next)}
                  />
                </li>
              )
            })}
          </ul>
          <ShareNote id={NOTE_ID} />
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
        </>
      ) : (
        <div className="share-panel-empty">
          <p className="muted">{words.noGroupConnected}</p>
          <Button type="button" variant="ghost" onClick={() => setJoinOpen(true)}>
            {t('{group} beitreten oder gründen', { group: words.group })}
          </Button>
        </div>
      )}

      <Modal open={joinOpen} title={t('{group} beitreten oder gründen', { group: words.group })} onClose={() => setJoinOpen(false)}>
        <JoinFamilyDialog onChange={(me) => onFamilyChange?.(me)} onClose={() => setJoinOpen(false)} />
      </Modal>
    </section>
  )
}
