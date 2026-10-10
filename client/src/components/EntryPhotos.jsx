import { t } from '../lib/i18n/index.js'

// Fotos eines Chronik-Eintrags oder Meilensteins als Raster (1-4 Spalten); ein Klick öffnet das Foto groß.
export default function EntryPhotos({ urls, onOpenPhoto }) {
  if (!urls?.length) return null
  return (
    <div className={`entry-photos count-${Math.min(urls.length, 4)}`}>
      {urls.map((url) => (
        <button type="button" key={url} className="entry-photo" onClick={() => onOpenPhoto(url)} aria-label={t('Foto vergrößern')}>
          <img src={url} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  )
}
