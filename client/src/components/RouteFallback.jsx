import { t } from '../lib/i18n/index.js'
// Platzhalter, solange eine erst bei Bedarf geladene Seite (React.lazy in App.jsx/AreaRoutes.jsx) nachlädt.
// Sitzt innerhalb von <main> - Kopf, Navigation und Fuß bleiben dabei stehen. Derselbe dezente Stil wie
// das "Lade …" der Seiten selbst (z. B. PartnerProfilePage), page-loading hält die Höhe, damit der Fuß
// nicht kurz nach oben springt.
export default function RouteFallback() {
  return (
    <p className="muted page-loading" role="status">
      {t('Lädt …')}
    </p>
  )
}
