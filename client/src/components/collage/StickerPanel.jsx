import { useId } from 'react'
import Icon from '../Icon.jsx'
import {
  MAX_STICKERS,
  STICKER_GROUPS,
  STICKER_LICENSE_URL,
  getSticker,
  stickerLabels,
  stickerUrl,
  stickersOfGroup
} from '../../lib/collage/stickers.js'
import { moveSticker, rotateSticker, scaleSticker } from '../../lib/collage/stickerTransform.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Reiter "Sticker" im Collage-Editor: ausgewählter Sticker (verschieben, Größe, Drehung, entfernen), die Sticker
// dieser Seite zum Auswählen und die Auswahl nach Gruppen. Alles geht ohne Ziehen (Knöpfe, Tastatur).
// Sticker: Fluent Emoji von Microsoft (MIT), lokal unter /stickers/ - Lizenz: /stickers/LICENSE.txt
const SIZE_STEP = 1.15
const ROTATE_STEP = 15
const MOVE_STEP = 0.02

const MOVES = [
  ['Nach links', 'arrowLeft', '', -MOVE_STEP, 0],
  ['Nach oben', 'arrowLeft', 'icon-up', 0, -MOVE_STEP],
  ['Nach unten', 'arrowLeft', 'icon-down', 0, MOVE_STEP],
  ['Nach rechts', 'arrowRight', '', MOVE_STEP, 0]
]

function StickerControls({ sticker, actions }) {
  const update = (next) => actions.updateSticker(sticker.id, next)
  return (
    <section className="inspector-section inspector-photo">
      <h3>{t('Ausgewählter Sticker')}</h3>
      <div className="sticker-selected">
        <img src={stickerUrl(sticker.sticker)} alt="" width="40" height="40" />
        <strong>{t(getSticker(sticker.sticker)?.label || 'Sticker')}</strong>
      </div>
      <div className="inspector-buttons sticker-moves" role="group" aria-label={t('Verschieben')}>
        {MOVES.map(([label, icon, className, dx, dy]) => (
          <Button key={label} type="button" variant="ghost" aria-label={t(label)} title={t(label)} onClick={() => update(moveSticker(sticker, dx, dy))}>
            <Icon name={icon} className={className} />
          </Button>
        ))}
      </div>
      <div className="inspector-buttons">
        <Button type="button" variant="ghost" onClick={() => update(scaleSticker(sticker, 1 / SIZE_STEP))}>
          <Icon name="minus" /> {t('Kleiner')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => update(scaleSticker(sticker, SIZE_STEP))}>
          <Icon name="plus" /> {t('Größer')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => update(rotateSticker(sticker, -ROTATE_STEP))}>
          <Icon name="rotate" className="icon-flip" /> {t('Links drehen')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => update(rotateSticker(sticker, ROTATE_STEP))}>
          <Icon name="rotate" /> {t('Rechts drehen')}
        </Button>
      </div>
      <p className="field-hint">
        {t('In der Vorschau ziehen verschiebt, die Griffe ändern Größe und Drehung. Tastatur: Pfeiltasten, + und −, R, Entf.')}
      </p>
      <Button type="button" variant="danger" onClick={() => actions.removeSticker(sticker.id)}>
        <Icon name="trash" /> {t('Sticker entfernen')}
      </Button>
    </section>
  )
}

// Sticker dieser Seite - auch verdeckte oder winzige lassen sich hier auswählen.
function PlacedStickers({ stickers, selectedId, onSelect }) {
  const labelId = useId()
  if (!stickers.length) return null
  const labels = stickerLabels(stickers)
  return (
    <section className="inspector-section">
      <h3 id={labelId}>{t('Auf dieser Seite')}</h3>
      <div className="sticker-grid" role="group" aria-labelledby={labelId}>
        {stickers.map((sticker, i) => (
          <button
            key={sticker.id}
            type="button"
            className={`sticker-option ${sticker.id === selectedId ? 'is-current' : ''}`}
            aria-pressed={sticker.id === selectedId}
            aria-label={t('{name} auswählen', { name: labels[i] })}
            title={labels[i]}
            onClick={() => onSelect(sticker.id)}
          >
            <img src={stickerUrl(sticker.sticker)} alt="" width="32" height="32" draggable={false} />
          </button>
        ))}
      </div>
    </section>
  )
}

function StickerGroup({ group, full, onAdd }) {
  const labelId = useId()
  return (
    <div className="sticker-group">
      <h4 id={labelId}>{t(group.label)}</h4>
      <div className="sticker-grid" role="group" aria-labelledby={labelId}>
        {stickersOfGroup(group.id).map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            className="sticker-option"
            // aria-disabled statt disabled: der Fokus bleibt auf dem Knopf, wenn die Seite gerade voll wird
            aria-disabled={full || undefined}
            onClick={() => !full && onAdd(sticker.id)}
            title={t(sticker.label)}
            aria-label={t('{name} hinzufügen', { name: t(sticker.label) })}
          >
            <img src={stickerUrl(sticker.id)} alt="" width="32" height="32" loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  )
}

function StickerPicker({ count, onAdd }) {
  const full = count >= MAX_STICKERS
  return (
    <section className="inspector-section">
      <h3>{t('Sticker hinzufügen')}</h3>
      <p className="field-hint" aria-live="polite">
        {full
          ? t('{n} von {max} Stickern auf dieser Seite – mehr passen nicht.', { n: count, max: MAX_STICKERS })
          : t('{n} von {max} Stickern auf dieser Seite.', { n: count, max: MAX_STICKERS })}
      </p>
      {STICKER_GROUPS.map((group) => (
        <StickerGroup key={group.id} group={group} full={full} onAdd={onAdd} />
      ))}
      <p className="sticker-credit">
        {t('Sticker: Fluent Emoji von Microsoft,')}{' '}
        <a href={STICKER_LICENSE_URL} target="_blank" rel="noopener noreferrer">
          {t('MIT-Lizenz')}
        </a>
      </p>
    </section>
  )
}

export default function StickerPanel({ page, selectedSticker, actions }) {
  const stickers = page.stickers || []
  return (
    <>
      {selectedSticker ? (
        <StickerControls sticker={selectedSticker} actions={actions} />
      ) : (
        <p className="inspector-tip">
          <Icon name="star" />{' '}
          {t('Wähle unten einen Sticker – er landet mitten auf der Seite. Dort ziehen, drehen und in der Größe ändern.')}
        </p>
      )}
      <PlacedStickers stickers={stickers} selectedId={selectedSticker?.id} onSelect={actions.selectSticker} />
      <StickerPicker count={stickers.length} onAdd={actions.addSticker} />
    </>
  )
}
