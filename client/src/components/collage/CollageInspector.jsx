import ConfirmButton from '../ConfirmButton.jsx'
import TabBar from '../TabBar.jsx'
import DesignPanel from './DesignPanel.jsx'
import PhotoPanel from './PhotoPanel.jsx'
import StickerPanel from './StickerPanel.jsx'
import { t } from '../../lib/i18n/index.js'

export const INSPECTOR_TABS = [
  { key: 'seite', label: 'Seite' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'sticker', label: 'Sticker' }
]
const PANEL_ID = 'collage-inspector-panel'

function PageTexts({ page, onChange }) {
  const field = (key, label, placeholder) => (
    <div className="field">
      <label className="field-label" htmlFor={`cpage-${key}`}>
        {label}
      </label>
      <input
        id={`cpage-${key}`}
        value={page[key]}
        placeholder={placeholder}
        maxLength={160}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </div>
  )
  return (
    <section className="inspector-section">
      <h3>{t('Texte')}</h3>
      {field('title', t('Titel'), t('z. B. Hermes'))}
      {field('subtitle', t('Untertitel'), t('z. B. Berner-Mix · geboren am 14. Mai 2026'))}
      {field('footer', t('Fußzeile'), t('z. B. Mutter: Tilda · Vater: Bodo'))}
    </section>
  )
}

// Seitenleiste des Editors in drei Reitern: Seite (Texte, Vorlage, Hintergrund), Fotos, Sticker.
// actions: Editor-Aktionen aus useCollageEditor (hooks/useCollageEditor.js).
export default function CollageInspector({ tab, onTabChange, page, pageCount, selectedPhoto, selectedSticker, trayPhotos, actions, canDeletePage }) {
  return (
    <aside className="inspector">
      <TabBar
        tabs={INSPECTOR_TABS.map((item) => ({ ...item, label: t(item.label) }))}
        current={tab}
        label={t('Seite bearbeiten')}
        idPrefix="collage-tab"
        panelId={PANEL_ID}
        className="inspector-tabs"
        onSelect={onTabChange}
      />
      <div className="inspector-panel" id={PANEL_ID} role="tabpanel" aria-labelledby={`collage-tab-${tab}`}>
        {tab === 'seite' && (
          <>
            <PageTexts page={page} onChange={actions.updatePage} />
            <DesignPanel page={page} pageCount={pageCount} actions={actions} />
            {canDeletePage && (
              <section className="inspector-section">
                <ConfirmButton onConfirm={actions.deletePage} label={t('Diese Seite löschen')} confirmLabel={t('Seite wirklich löschen?')} />
              </section>
            )}
          </>
        )}
        {tab === 'fotos' && <PhotoPanel page={page} selectedPhoto={selectedPhoto} trayPhotos={trayPhotos} actions={actions} />}
        {tab === 'sticker' && <StickerPanel page={page} selectedSticker={selectedSticker} actions={actions} />}
      </div>
    </aside>
  )
}
