import { Link } from 'react-router-dom'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import FamilyShareCard from '../shares/FamilyShareCard.jsx'
import ShareNote from '../shares/ShareNote.jsx'
import { SectionHeader } from '../ui/index.js'
import { SETTINGS_ROUTE } from '../../lib/areas.js'
import { useT } from '../../lib/i18n/index.js'

const NOTE_ID = 'sicht-share-note'

function Familien({ family, data, matrix, readOnly }) {
  const t = useT()
  const memberships = family.memberships || []
  return (
    <section className="settings-group" aria-labelledby="sicht-familien-title">
      <SectionHeader id="sicht-familien-title" title={t('Familien')} description={t('Schalter aus = diese Familie sieht das Tier nicht mehr.')} />
      {memberships.length === 0 && <p className="muted">{t('Ihr seid noch in keiner Familie.')}</p>}
      {memberships.length > 0 && data.animals.length > 0 && (
        <>
          <div className="share-cards">
            {memberships.map((membership) => (
              <FamilyShareCard key={membership.id} membership={membership} animals={data.animals} matrix={matrix} readOnly={readOnly} describedBy={NOTE_ID} />
            ))}
          </div>
          <ShareNote id={NOTE_ID} />
        </>
      )}
    </section>
  )
}

function Gaeste({ data, sicht, readOnly }) {
  const t = useT()
  return (
    <section className="settings-group" aria-labelledby="sicht-gaeste-title">
      <SectionHeader id="sicht-gaeste-title" title={t('Gäste')} description={t('Gäste sehen alle eure Tiere und alle nicht privaten Erinnerungen – nur lesen.')} />
      {data.guests.length === 0 ? (
        <p className="muted">{t('Gerade hat niemand Gast-Zugang.')}</p>
      ) : (
        <ul className="settings-list">
          {data.guests.map((guest) => (
            <li key={guest.id} className="settings-row">
              <div className="settings-row-main">
                <strong>{guest.name}</strong>
                <span className="settings-row-sub">{t('sieht alle {n} Tiere', { n: data.animals.length })}</span>
              </div>
              <div className="settings-row-actions">
                <ConfirmButton
                  label="Entfernen"
                  confirmLabel="Wirklich entfernen?"
                  icon="close"
                  ariaLabel={t('{name} als Gast entfernen', { name: guest.name })}
                  disabled={readOnly || sicht.isBusy(`guest-${guest.id}`)}
                  onConfirm={() => sicht.removeGuest(guest.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Bilderrahmen({ data }) {
  const t = useT()
  if (data.frames.length === 0) return null
  return (
    <section className="settings-group" aria-labelledby="sicht-rahmen-title">
      <SectionHeader id="sicht-rahmen-title" title={t('Bilderrahmen')} description={t('Ein Rahmen-Link zeigt Fotos ohne Anmeldung – nur die Tiere, die ihr dafür gewählt habt.')} />
      <ul className="sicht-lines" role="list">
        {data.frames.map((frame) => (
          <li key={frame.id}>
            <Icon name="frame" />
            {frame.name}
            {frame.auswahl?.privat && <span className="muted"> · {t('auch private Erinnerungen')}</span>}
          </li>
        ))}
      </ul>
      <Link className="btn btn-ghost btn-compact" to={`${SETTINGS_ROUTE}?bereich=zuhause`}>
        {t('Bilderrahmen verwalten')}
      </Link>
    </section>
  )
}

// Ansicht „Familien & Gäste“: je Familie, welche eigenen Tiere sie sieht (derselbe Schalter wie je Tier), die Gäste mit
// „Entfernen“ (DELETE /api/besuche/gaeste/:id) und die Bilderrahmen-Links (verwaltet unter „Mein Zuhause“).
export default function VerbindungenAnsicht(props) {
  return (
    <>
      <Familien {...props} />
      <Gaeste {...props} />
      <Bilderrahmen {...props} />
    </>
  )
}
