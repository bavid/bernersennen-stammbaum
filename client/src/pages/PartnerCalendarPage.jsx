import PartnerTermineEditor from '../components/PartnerTermineEditor.jsx'

// /kalender (Phase V4a) - der Kalender eines Partner-Bereichs: Termine und Serien, die ohne Freigabe auf dem Portal und
// als "Nächster Termin" auf der Karte in Entdecken erscheinen. Tierheime erreichen denselben Kalender als Reiter
// "Kalender" im Profil (PartnerProfilePage), damit ihre Navigation bei fünf Einträgen bleibt.
export default function PartnerCalendarPage({ family }) {
  const name = family.partner?.name || family.name

  return (
    <div className="page partner-calendar-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{name}</span>
          <h1>Kalender</h1>
          <p className="page-lede">Kurse, Treffen und offene Stunden – einmalig oder als Serie, mit Absagen für einzelne Tage.</p>
        </div>
      </header>

      <PartnerTermineEditor />
    </div>
  )
}
