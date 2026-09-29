// Datenschutz-Abschnitte zu Phase N (LegalPage, /datenschutz): "Anfragen" (was wir speichern, wofür, wie lange -
// server/lib/anfragen.js) und "Benachrichtigungen des Betreibers" (Telegram, standardmäßig ohne personenbezogene
// Daten - server/lib/notify.js). Eigene Datei, damit LegalPage schlank bleibt.
export default function PrivacyRequests() {
  return (
    <>
      <h2>Anfragen</h2>
      <p>
        Über „Noch keinen Gutschein?“ (auf der Anmeldeseite und in der Demo) und „Partner-Zugang anfragen“
        (/partner-werden) könnt ihr uns eine Anfrage schicken. Gespeichert werden dabei eure E-Mail-Adresse (Pflicht,
        damit wir antworten können), freiwillig ein Name und eine Nachricht – bei Partner-Anfragen außerdem der Name der
        Hundeschule, des Tierheims oder Geschäfts, die Art des Angebots und, freiwillig, die Postleitzahl.
      </p>
      <p>
        Wir nutzen diese Angaben nur, um euch einen Gutschein oder einen Partner-Zugang zu schicken; die Antwort schreibt
        der Betreiber selbst per E-Mail. Damit sie ankommen kann, prüft unser Server beim Absenden per DNS, ob es die
        Domain der E-Mail-Adresse gibt – nachgeschlagen wird nur der Teil nach dem @, verschickt wird dabei nichts.
        Anfragen sieht nur der Betreiber im Admin-Bereich. Erledigte und abgelehnte Anfragen löschen wir 180 Tage nach dem
        Abschluss automatisch, offene spätestens 365 Tage nach dem Eingang bzw. der letzten Bearbeitung. Gegen Missbrauch
        begrenzen wir, wie viele Anfragen in kurzer Zeit von einem Anschluss aus möglich sind; Inhalte und
        E-Mail-Adressen landen dabei nicht in Protokollen.
      </p>

      <h2>Benachrichtigungen des Betreibers</h2>
      <p>
        Damit keine Anfrage liegen bleibt, kann sich der Betreiber über den Messenger-Dienst Telegram benachrichtigen
        lassen – bei neuen Anfragen, neuen Registrierungen, Feedback über „Schreib dem Admin“ und eingereichten Beiträgen
        von Partnern. Standardmäßig enthalten diese Nachrichten keine personenbezogenen Daten, nur den Hinweis, dass es
        etwas Neues gibt (zum Beispiel „Neue Gutschein-Anfrage“).
      </p>
      <p>
        Schaltet der Betreiber „Details mitsenden“ ein, gehen zusätzlich Name und E-Mail-Adresse einer Anfrage (bei
        Partnern auch Name und Art des Angebots), der Name eines neuen Bereichs, der Anfang eines Feedbacks bzw. der Titel
        eines eingereichten Beitrags an Telegram. Die Nachrichten verschickt unser Server; euer Browser hat dabei keinen
        Kontakt zu Telegram – Telegram erfährt weder eure IP-Adresse noch etwas über euer Gerät.
      </p>
    </>
  )
}
