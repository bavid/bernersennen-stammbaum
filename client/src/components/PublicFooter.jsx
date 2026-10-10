import { Link } from 'react-router-dom'
import { t } from '../lib/i18n/index.js'

// Fuß der öffentlichen Seiten: Links auf Impressum/Datenschutz (LegalPage, siehe App.jsx /impressum und /datenschutz).
// geoNames: nur auf Seiten mit Postleitzahl-Suche (Partnerliste) die Quellenangabe für die PLZ-Daten - sonst ist sie
// Fachsprache ohne Bezug (Audit /netzwerk).
export default function PublicFooter({ geoNames = false }) {
  return (
    <footer className="public-footer">
      {geoNames && <p>{t('Postleitzahlen: GeoNames (CC BY 4.0)')}</p>}
      <nav className="public-footer-links" aria-label={t('Rechtliches')}>
        <Link to="/impressum">{t('Impressum')}</Link>
        <Link to="/datenschutz">{t('Datenschutz')}</Link>
      </nav>
    </footer>
  )
}
