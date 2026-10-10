import { t } from '../../lib/i18n/index.js'
// Ruhige Hinweise der Suche: vor dem Tippen (Tipps), bei nur einem Zeichen, wenn nichts gefunden wurde und wenn der Server
// nicht alles durchsuchen konnte (partial).
export default function SearchHints({ kind, query }) {
  if (kind === 'short') return <p className="search-hint">{t('Noch ein Zeichen mehr – ab zwei Zeichen geht’s los.')}</p>
  if (kind === 'partial') {
    return <p className="search-hint">{t('Nicht alles durchsucht – mit einem genaueren Wort findet ihr mehr.')}</p>
  }
  if (kind === 'none') {
    return (
      <div className="search-hint">
        <p className="search-hint-title">{t('Keine Treffer für „{query}“.', { query })}</p>
        <p>{t('Versucht ein kürzeres Wort oder eine andere Schreibweise – Umlaute dürft ihr auch als ae, oe, ue tippen.')}</p>
      </div>
    )
  }
  return (
    <div className="search-hint">
      <p>{t('Sucht nach dem Namen eines Tiers, einem Wort aus einer Erinnerung, einem Zettel der Pinnwand, einer Familie oder einer Hundeschule.')}</p>
      <p className="search-hint-keys">
        {t('Von überall:')} <kbd>{t('Strg')}</kbd> + <kbd>K</kbd> ({t('am Mac')} <kbd>⌘</kbd> + <kbd>K</kbd>)
      </p>
    </div>
  )
}
