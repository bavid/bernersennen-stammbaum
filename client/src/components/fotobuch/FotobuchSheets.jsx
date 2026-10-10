import { formatDateLong } from '../../lib/dates.js'
import { t } from '../../lib/i18n/index.js'

// Die Bögen des Fotobuchs (.voucher-sheet aus print.css, Papierfarben fest in styles/fotobuch.css): ein Titelblatt,
// dann die Seiten aus lib/fotobuch.js paginate - Polaroids mit Datum in Handschrift, Titel und gekürztem Text.

export const FOTOBUCH_FOOTER = 'Gemacht mit Familie auf Pfoten'

function Cover({ book }) {
  return (
    <section className="voucher-sheet fotobuch-sheet fotobuch-cover" aria-label={t('Titelblatt')}>
      <figure className="fotobuch-polaroid fotobuch-cover-photo">
        {book.cover.photo ? <img src={book.cover.photo} alt={book.name} /> : <span className="fotobuch-nophoto" aria-hidden="true" />}
      </figure>
      <h2 className="fotobuch-cover-name">{book.name}</h2>
      <p className="fotobuch-cover-title hand">{t('Unsere Chronik')}</p>
      {book.cover.years && <p className="fotobuch-cover-years">{book.cover.years}</p>}
    </section>
  )
}

function Memory({ item }) {
  return (
    <article className={item.photo ? 'fotobuch-memory' : 'fotobuch-memory is-text'}>
      {item.photo && (
        <figure className="fotobuch-polaroid">
          <img src={item.photo} alt={item.titel || ''} />
        </figure>
      )}
      <div className="fotobuch-memory-body">
        <p className="fotobuch-date hand">{formatDateLong(item.datum)}</p>
        {item.titel && <h3 className="fotobuch-memory-title">{item.titel}</h3>}
        {item.text && <p className="fotobuch-memory-text">{item.text}</p>}
      </div>
    </article>
  )
}

function Page({ page, number, perPage, name, isLast }) {
  return (
    <section className={`voucher-sheet fotobuch-sheet fotobuch-page is-${perPage}`} aria-label={t('Seite {n}', { n: number })}>
      {page.chapter && <h2 className="fotobuch-chapter">{page.chapter}</h2>}
      <div className="fotobuch-grid">
        {page.items.map((item) => (
          <Memory key={item.id} item={item} />
        ))}
      </div>
      <footer className="fotobuch-footer">
        <span>{isLast ? t(FOTOBUCH_FOOTER) : name}</span>
        <span>{number}</span>
      </footer>
    </section>
  )
}

export default function FotobuchSheets({ book, perPage }) {
  return (
    <>
      <Cover book={book} />
      {book.pages.map((page, index) => (
        <Page key={index} page={page} number={index + 1} perPage={perPage} name={book.name} isLast={index === book.pages.length - 1} />
      ))}
    </>
  )
}
