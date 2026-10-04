import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'

// Live-Vorschau im Mini-Designer (Einstellungen → Darstellung): eine kleine Album-Karte mit Polaroid, Kapitel in
// Handschrift, Titel, Knopf und Grüßen - in den Farben, Schriften und Ecken, die gerade an <html> gelten (jede Wahl wirkt
// sofort). Nur ein Bild: für Screenreader ausgeblendet, die Auswahl daneben sagt alles.
export default function DesignPreview() {
  const { words } = useTheme()
  return (
    <div className="designer-preview" aria-hidden="true">
      <span className="designer-preview-eyebrow">Vorschau</span>
      <div className="designer-preview-card card">
        <span className="designer-preview-chapter hand">Herbst 2026</span>
        <div className="designer-preview-row">
          <span className="designer-preview-photo polaroid">
            <span className="designer-preview-picture" />
          </span>
          <span className="designer-preview-text">
            <span className="designer-preview-title">Ausflug an den Deich</span>
            <span className="designer-preview-meta">Nele und Flocke · erzählt von Oma Gisela</span>
            <span className="designer-preview-greetings">
              <Icon name="heart" />3 {words.greetings}
            </span>
          </span>
        </div>
        <span className="btn btn-primary designer-preview-button">
          <Icon name="camera" />
          {words.tellAction}
        </span>
        <span className="designer-preview-link">Wieder ansehen</span>
      </div>
    </div>
  )
}
