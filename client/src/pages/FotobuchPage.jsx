import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Button, EmptyState } from '../components/ui'
import FotobuchOptions from '../components/fotobuch/FotobuchOptions.jsx'
import FotobuchSheets from '../components/fotobuch/FotobuchSheets.jsx'
import useSheetFit from '../hooks/useSheetFit.js'
import { usePrintBodyClass } from '../components/VoucherPrintView.jsx'
import { parseAreaId } from '../lib/areas.js'
import { todayIso } from '../lib/dates.js'
import { DEFAULT_OPTIONS, MAX_MEMORIES, bookImages, buildBook, canMakeBook, hasPrivate } from '../lib/fotobuch.js'
import { t } from '../lib/i18n/index.js'
import '../styles/fotobuch.css'

// Druckseite „Chronik als Fotobuch“ (/tier/:id/fotobuch, App.jsx: ohne App-Hülle wie Suchplakat und Startpaket). Liest nur
// getDog/listTimeline - der Server gibt nur Erinnerungen heraus, die der aktive Bereich sehen darf; private bleiben ohne
// Haken draußen. Drucken erst, wenn alle Bilder geladen sind (sonst fehlen sie im PDF).

export const EMPTY_TEXT = 'Für ein Fotobuch braucht es mindestens eine Erinnerung.'

function useBookData(id) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let current = true
    if (!id) {
      setError(t('Dieses Tier gibt es hier nicht.'))
      return undefined
    }
    Promise.all([api.getDog(id), api.listTimeline(id)])
      .then(([dog, entries]) => current && setData({ dog, entries: Array.isArray(entries) ? entries : [] }))
      .catch((err) => current && setError(err.message))
    return () => {
      current = false
    }
  }, [id])
  return { data, error }
}

// Zählt geladene (oder fehlgeschlagene) Bilder - ein kaputtes Bild soll das Drucken nicht für immer sperren.
function useImagesLoaded(urls) {
  const key = urls.join('\n')
  const [state, setState] = useState({ key: '', done: 0 })
  useEffect(() => {
    let current = true
    let done = 0
    setState({ key, done: 0 })
    const images = urls.map((url) => {
      const image = new Image()
      const finish = () => {
        if (!current) return
        done += 1
        setState({ key, done })
      }
      image.onload = finish
      image.onerror = finish
      image.src = url
      return image
    })
    return () => {
      current = false
      images.forEach((image) => {
        image.onload = null
        image.onerror = null
      })
    }
    // urls stecken vollständig in key - eine neue Liste mit gleichem Inhalt lädt nicht neu
  }, [key])
  const done = state.key === key ? state.done : 0
  return { done: Math.min(done, urls.length), total: urls.length }
}

function Message({ children }) {
  return (
    <div className="print-page">
      <main className="print-main">{children}</main>
    </div>
  )
}

function BookSheets({ book, perPage }) {
  const fitRef = useSheetFit()
  return (
    <div ref={fitRef} className="voucher-sheets">
      <FotobuchSheets book={book} perPage={perPage} />
    </div>
  )
}

function PrintButton({ progress }) {
  const ready = progress.done >= progress.total
  return (
    <Button onClick={() => window.print()} disabled={!ready} aria-describedby={ready ? undefined : 'fotobuch-progress'}>
      {ready ? t('Drucken') : t('Bilder laden … {done} von {total}', progress)}
    </Button>
  )
}

function Book({ dog, entries, id }) {
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const book = useMemo(() => buildBook({ dog, entries, options, today: todayIso() }), [dog, entries, options])
  const progress = useImagesLoaded(bookImages(book))
  return (
    <div className="print-page fotobuch-print">
      <div className="print-toolbar">
        <Button variant="ghost" as={Link} to={`/tier/${id}`}>
          {t('Zurück zum Tier')}
        </Button>
        <span className="print-toolbar-spacer" />
        <PrintButton progress={progress} />
      </div>
      <main className="print-main">
        <header className="print-head">
          <h1>{t('Fotobuch für {name}', { name: book.name })}</h1>
          <p className="print-head-meta">
            {t('{count} Erinnerungen auf {pages} Seiten plus Titelblatt. Zum Drucken oder „Als PDF speichern“.', {
              count: book.count,
              pages: book.pages.length
            })}
          </p>
          <FotobuchOptions options={options} showPrivate={hasPrivate(entries)} onChange={setOptions} />
          {book.capped && (
            <p className="notice" role="status">
              {t(
                'Ein Buch fasst höchstens {max} Erinnerungen – es zeigt die ersten {max} von {total}. Wählt einen kürzeren Zeitraum für den Rest.',
                { max: MAX_MEMORIES, total: book.total }
              )}
            </p>
          )}
          {progress.done < progress.total && (
            <p id="fotobuch-progress" className="field-hint" role="status">
              {t('Bilder laden … {done} von {total}', progress)}
            </p>
          )}
        </header>
        {book.count > 0 ? (
          <BookSheets book={book} perPage={options.perPage} />
        ) : (
          <EmptyState icon="calendar" title={t('Keine Erinnerungen in diesem Zeitraum')}>
            {t('Wählt einen anderen Zeitraum.')}
          </EmptyState>
        )}
      </main>
    </div>
  )
}

export default function FotobuchPage({ dogId }) {
  usePrintBodyClass()
  const id = parseAreaId(dogId)
  const { data, error } = useBookData(id)

  if (error) {
    return (
      <Message>
        <div className="error-banner" role="alert">
          {error}
        </div>
      </Message>
    )
  }
  if (!data) return <div className="print-page" aria-busy="true" />
  if (!canMakeBook(data.entries)) {
    return (
      <Message>
        <EmptyState icon="image" title={t('Noch kein Fotobuch')}>
          {t(EMPTY_TEXT)}
        </EmptyState>
      </Message>
    )
  }
  return <Book dog={data.dog} entries={data.entries} id={id} />
}
