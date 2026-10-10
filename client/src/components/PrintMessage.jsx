import { Link } from 'react-router-dom'
import { Button } from './ui'
import { t } from '../lib/i18n/index.js'

// Hinweis-Zustand der Druckseiten ohne App-Hülle (Startpaket, Suchplakat, Fotobuch): Fehler, kein Zugriff, nichts zu
// drucken. Oben immer ein Weg zurück - zum Tier, wenn es eins gibt, sonst zur Startseite.
export default function PrintMessage({ dogId = null, children }) {
  return (
    <div className="print-page">
      <div className="print-toolbar">
        <Button variant="ghost" as={Link} to={dogId ? `/tier/${dogId}` : '/'}>
          {dogId ? t('Zurück zum Tier') : t('Zur Startseite')}
        </Button>
      </div>
      <main className="print-main">{children}</main>
    </div>
  )
}
