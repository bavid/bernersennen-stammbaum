import { Link } from 'react-router-dom'

// Fuß der öffentlichen Seiten (Portal, Partnerliste, später „In der Nähe"): Quellenangabe für die
// PLZ-Daten (GeoNames) und Links auf Impressum/Datenschutz. Die Rechtsseiten kommen erst in Task 7 –
// bis dahin führen die Links ins Leere (404/Login), was für diese Phase in Ordnung ist.
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
