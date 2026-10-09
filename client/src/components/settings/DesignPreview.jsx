import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import { useT } from '../../lib/i18n/index.js'

// Live-Vorschau im Mini-Designer (Einstellungen → Darstellung): eine kleine Album-Karte mit Polaroid, Kapitel in
// Handschrift, Titel, Knopf und Grüßen - in den Farben, Schriften und Ecken, die gerade an <html> gelten (jede Wahl wirkt
// sofort). Nur ein Bild: für Screenreader ausgeblendet, die Auswahl daneben sagt alles.
export default function DesignPreview() {
  const { words } = useTheme()
  const t = useT()
  return (
    <div className="designer-preview" aria-hidden="true">
      <span className="designer-preview-eyebrow">{t('settings.design.preview')}</span>
      <div className="designer-preview-card card">
        <span className="designer-preview-chapter hand">{t('settings.design.chapter')}</span>
        <div className="designer-preview-row">
          <span className="designer-preview-photo polaroid">
            <span className="designer-preview-picture" />
          </span>
          <span className="designer-preview-text">
            <span className="designer-preview-title">{t('settings.design.title')}</span>
            <span className="designer-preview-meta">{t('settings.design.meta')}</span>
            <span className="designer-preview-greetings">
              <Icon name="heart" />3 {words.greetings}
            </span>
          </span>
        </div>
        <span className="btn btn-primary designer-preview-button">
          <Icon name="camera" />
          {words.tellAction}
        </span>
        <span className="designer-preview-link">{t('settings.design.again')}</span>
      </div>
    </div>
  )
}
