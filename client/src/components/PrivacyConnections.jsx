import LegalSection from './legal/LegalSection.jsx'

// Datenschutz-Abschnitte zu Phase V und G (LegalPage, /datenschutz, Audit V7a): Zuhause besuchen (server/lib/visits.js,
// lib/visitInvites.js), "Erlebt mit" (lib/erlebtMit.js), Telegram-Hinweise für Partner (lib/partnerTelegram.js,
// lib/partnerNotify.js), das Hinweis-Band (lib/hinweise.js, client/src/lib/hinweise.js) und die Sicherungen
// (lib/autoBackup.js, deploy/remote.sh backup). Nur, was die App tatsächlich tut - eigene Datei wie PrivacyRequests.
// Überschriften: lib/legalSections.js.
export default function PrivacyConnections() {
  return (
    <>
      <LegalSection id="besuche">
        <p>
          Ein Zuhause kann ein anderes Zuhause mit einer Besuchs-Einladung zu sich einladen; der Code gilt 7 Tage und nur
          einmal. Wer ihn einlöst, sieht als Gast eure Tiere und alle Erinnerungen, die nicht als privat markiert sind, und
          kann sie kommentieren – ändern kann er nichts. Private Erinnerungen, Pinnwand, Entdecken und Collage gehören nicht zum
          Besuch. Beide Seiten können den Besuch jederzeit beenden: einen Gast entfernt ihr mit „Beenden“ unter „Meine
          Gäste“ (Einstellungen › Mein Zuhause), einen neuen Gast auch gleich mit „Entfernen“ in den Hinweisen.
        </p>
      </LegalSection>

      <LegalSection id="mit-dabei">
        <p>
          Wer in seinem Zuhause eine nicht-private Erinnerung festhält, kann darin Tiere aus verbundenen Zuhausen markieren
          (über einen Besuch oder eine gemeinsame Familie). Die Menschen des markierten Tiers bekommen dazu eine Anfrage. Erst
          wenn sie bestätigen, erscheint die Erinnerung auch in der Chronik ihres Tiers – als Verweis auf das Original, nicht
          als Kopie, und nur, solange die Verbindung besteht und die Erinnerung nicht privat ist. Lehnen sie ab,
          verschwindet die Markierung.
        </p>
      </LegalSection>

      <LegalSection id="telegram-partner">
        <p>
          Partner können sich über den Messenger-Dienst Telegram benachrichtigen lassen, zum Beispiel wenn über „Schreib
          uns“ eine neue Nachricht da ist oder ein Beitrag freigegeben bzw. abgelehnt wurde. Verbunden wird erst, wenn der
          Partner im Telegram-Chat ausdrücklich zustimmt. Die Chat-ID speichern wir verschlüsselt; sie geht nur an Telegram
          und erscheint weder in einer Antwort unseres Servers noch in einem Protokoll.
        </p>
        <p>
          Die Hinweise enthalten keine personenbezogenen Daten – keinen Namen, keine E-Mail-Adresse oder Telefonnummer und
          keinen Nachrichtentext, nur dass es etwas Neues gibt (bei Beiträgen deren Titel). Trennen lässt sich die
          Verbindung jederzeit im Partner-Bereich unter „Zugang“ oder mit /stop im Chat. Für Telegram selbst gelten die
          Datenschutzbestimmungen von Telegram.
        </p>
      </LegalSection>

      <LegalSection id="hinweise">
        <p>
          Hinweise des Betreibers, zum Beispiel vor Wartungsarbeiten, erscheinen als Band oben auf jeder Seite. Dafür wird
          nichts über euch gespeichert und nichts gezählt: welche Hinweise ihr weggeklickt habt und welche zuletzt geladen
          wurden, merkt sich nur euer Browser für diese Sitzung (sessionStorage).
        </p>
      </LegalSection>

      <LegalSection id="sicherungen">
        <p>
          Die Datenbank wird jeden Tag automatisch gesichert; diese Sicherungen bleiben 14 Tage und werden danach gelöscht.
          Vor jeder Aktualisierung der App sichert der Betreiber zusätzlich Datenbank und Fotos – davon bleiben nur die
          letzten zehn. Was ihr löscht, verschwindet deshalb nicht sofort aus den Sicherungen, sondern aus den täglichen
          spätestens nach 14 Tagen und aus denen vor Aktualisierungen, sobald zehn neuere angelegt wurden. Die Sicherungen
          liegen geschützt beim Betreiber und dienen nur dazu, nach einem Fehler den Stand wiederherzustellen.
        </p>
      </LegalSection>
    </>
  )
}
