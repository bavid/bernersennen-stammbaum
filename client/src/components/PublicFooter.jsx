import { Link } from 'react-router-dom'
import { t } from '../lib/i18n/index.js'

// Fuß der öffentlichen Seiten (Portal, Partnerliste): Quellenangabe für die PLZ-Daten (GeoNames) und
// Links auf Impressum/Datenschutz (LegalPage, siehe App.jsx /impressum und /datenschutz).
export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <p>{t('Postleitzahlen: GeoNames (CC BY 4.0)')}</p>
      <nav className="public-footer-links" aria-label={t('Rechtliches')}>
        <Link to="/impressum">{t('Impressum')}</Link>
        <Link to="/datenschutz">{t('Datenschutz')}</Link>
      </nav>
    </footer>
  )
}
