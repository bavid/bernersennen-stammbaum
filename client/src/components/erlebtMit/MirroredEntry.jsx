import ConfirmButton from '../ConfirmButton.jsx'
import ExpandableText from '../ExpandableText.jsx'
import EntryPhotos from '../EntryPhotos.jsx'
import Icon from '../Icon.jsx'
import { mirrorLabel } from '../../lib/erlebtMit.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Ein gespiegelter Eintrag (Phase V2, "Erlebt mit"): ein bestätigter Eintrag eines verbundenen Zuhauses in der
// Chronik des eigenen Tiers - ein Verweis aufs Original, darum ohne Bearbeiten und Kommentare. onOpenOrigin (nur wenn
// man das Zuhause besuchen kann) führt zum Original, onHide nimmt die Spiegelung wieder heraus.
export default function MirroredEntry({ item, onOpenPhoto, onOpenOrigin, onHide, hideDisabled }) {
  return (
    <article className="entry-card entry-card-mirrored">
      <header className="entry-head">
        <div>
          <p className="entry-mirror-label">
            <Icon name="paw" />
            {mirrorLabel(item.gespiegelt)}
          </p>
          <h3 className="entry-title">{item.titel}</h3>
          <p className="entry-meta">{t('von {name}', { name: item.autor_name })}</p>
        </div>
      </header>
      {item.text && <ExpandableText text={item.text} className="entry-text" lines={6} />}
      <EntryPhotos urls={item.foto_urls} onOpenPhoto={onOpenPhoto} />
      {(onOpenOrigin || onHide) && (
        <div className="entry-mirror-actions">
          {onOpenOrigin && (
            <Button type="button" variant="ghost" onClick={() => onOpenOrigin(item)}>
              {t('Bei {home} ansehen', { home: item.gespiegelt.zuhause })}
            </Button>
          )}
          {onHide && (
            <ConfirmButton
              label={t('Nicht mehr zeigen')}
              confirmLabel={t('Wirklich entfernen?')}
              disabled={hideDisabled}
              onConfirm={() => onHide(item)}
            />
          )}
        </div>
      )}
    </article>
  )
}
