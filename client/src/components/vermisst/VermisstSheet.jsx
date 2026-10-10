import { t } from '../../lib/i18n/index.js'

// Das Suchplakat als A4-Bogen (.voucher-sheet aus print.css, Farben fest wie auf Papier: styles/vermisst.css).
// poster: lib/vermisst.js buildPoster. Leere Angaben bleiben als Linie zum Ausfüllen mit dem Stift stehen.

export const REGISTRY_HINT = 'Bitte meldet euch auch bei TASSO (tasso.net) und FINDEFIX (findefix.com).'

function Line({ label, value }) {
  return (
    <p className="vermisst-line">
      <span className="vermisst-line-label">{label}</span>
      <span className={value ? 'vermisst-line-value' : 'vermisst-line-value is-blank'}>{value || ' '}</span>
    </p>
  )
}

export default function VermisstSheet({ poster }) {
  return (
    <section className="voucher-sheet vermisst-sheet" aria-label={t('Suchplakat')}>
      <h2 className="vermisst-headline">{t('VERMISST')}</h2>
      <div className="vermisst-photo">
        {poster.photo ? <img src={poster.photo} alt={poster.name} /> : <span>{t('Kein Foto gewählt')}</span>}
      </div>
      <p className="vermisst-name">{poster.name}</p>
      {poster.facts.length > 0 && (
        <dl className="vermisst-facts">
          {poster.facts.map(([label, value]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="vermisst-seen">
        <Line label={t('Zuletzt gesehen am')} value={poster.seenDate} />
        <Line label={t('in')} value={poster.seenPlace} />
        {poster.chip && <Line label={t('Chipnummer')} value={poster.chip} />}
      </div>
      <div className="vermisst-contact">
        <p className="vermisst-contact-label">{t('Bitte meldet euch unter')}</p>
        <p className={poster.contact ? 'vermisst-contact-value' : 'vermisst-contact-value is-blank'}>{poster.contact || ' '}</p>
      </div>
      <footer className="vermisst-registries">
        <p>{t(REGISTRY_HINT)}</p>
      </footer>
    </section>
  )
}
