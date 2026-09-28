import { Link } from 'react-router-dom'

// Fuß der öffentlichen Seiten (Portal, Partnerliste): Quellenangabe für die PLZ-Daten (GeoNames) und
// Links auf Impressum/Datenschutz (LegalPage, siehe App.jsx /impressum und /datenschutz).
export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <p>Postleitzahlen: GeoNames (CC BY 4.0)</p>
      <nav className="public-footer-links" aria-label="Rechtliches">
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
      </nav>
    </footer>
  )
}
