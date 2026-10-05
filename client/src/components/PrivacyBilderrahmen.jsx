import LegalSection from './legal/LegalSection.jsx'

// Datenschutz-Abschnitt zum Digitalen Bilderrahmen (LegalPage, /datenschutz): die Diashow im eigenen Zuhause und der
// Rahmen-Link für ein anderes Gerät (server/lib/rahmenGeraete.js, server/routes/rahmen.js). Nur, was die App tatsächlich
// tut - eigene Datei wie PrivacyConnections. Überschrift: lib/legalSections.js.
export default function PrivacyBilderrahmen() {
  return (
    <LegalSection id="bilderrahmen">
      <p>
        Der Bilderrahmen zeigt die Fotos eurer Tiere als Diashow – angemeldet die Fotos, die ihr in eurem Zuhause ohnehin seht;
        private Erinnerungen nur, wenn ihr das in der Diashow ausdrücklich einschaltet. Welche Tiere, welcher Zeitraum und
        wie die Diashow aussieht, merkt sich nur euer Browser auf diesem Gerät (localStorage).
      </p>
      <p>
        Für ein anderes Gerät, zum Beispiel ein Tablet bei den Großeltern, könnt ihr in den Einstellungen unter „Mein
        Zuhause“ einen Rahmen-Link erstellen (höchstens fünf). Wer diesen Link öffnet, sieht ohne Anmeldung nur die Fotos
        eurer eigenen Tiere und eurer eigenen Erinnerungen – mit dem Namen des Tiers und dem Datum, nie die Texte eurer
        Erinnerungen und nie Tiere oder Erinnerungen anderer Zuhause, auch nicht aus gemeinsamen Familien. Private
        Erinnerungen erscheinen dort nur, wenn ihr das für diesen Rahmen ausdrücklich ankreuzt.
      </p>
      <p>
        Den Link zeigen wir genau einmal; gespeichert wird nur ein Hash davon, der Name des Geräts, eure Auswahl und wann der
        Rahmen zuletzt nach Fotos gefragt hat („zuletzt aktiv“) – keine IP-Adresse, keine Geräte-Kennung, kein Tracking. Das
        Gerät merkt sich den Link selbst (localStorage), die Fotos bekommt es über Adressen, die nach höchstens zwei Stunden
        ablaufen. Mit „Beenden“ gilt ein Rahmen sofort nicht mehr – es gibt keine Fotos mehr aus, das Gerät zeigt nach wenigen
        Minuten „beendet“; erneuert ihr euren Schlüssel, enden alle Rahmen-Links eures Zuhauses. Die Seite des Rahmens ist für
        Suchmaschinen ausgeschlossen (noindex).
      </p>
    </LegalSection>
  )
}
