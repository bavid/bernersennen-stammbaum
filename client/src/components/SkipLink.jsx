import { focusContent } from '../lib/focusContent.js'
import { t } from '../lib/i18n/index.js'

// "Zum Inhalt springen" (Audit V7a): der erste Tab-Stopp jeder Seite, nur sichtbar, solange er den Fokus hat - vorher
// lagen vor dem Inhalt bis zu 13 Stopps (Bänder, Kopf, Navigation). Ein Knopf statt eines #-Links: öffentliche Seiten,
// Login und Bereiche haben verschiedene Ziele (focusContent sucht <main>, sonst die Überschrift).
export default function SkipLink() {
  function handleClick() {
    if (focusContent()) window.scrollTo({ top: 0 })
  }
  return (
    <button type="button" className="btn btn-primary skip-link" onClick={handleClick}>
      {t('Zum Inhalt springen')}
    </button>
  )
}
