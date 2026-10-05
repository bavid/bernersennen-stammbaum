import { Link } from 'react-router-dom'
import LegalSection, { LegalToc } from './LegalSection.jsx'
import PrivacyRequests from '../PrivacyRequests.jsx'
import PrivacyConnections from '../PrivacyConnections.jsx'
import PrivacyBilderrahmen from '../PrivacyBilderrahmen.jsx'

// Datenschutz (/datenschutz, LegalPage): fester, sachlicher Text darüber, was die App tatsächlich tut - keine Textbausteine
// mit erfundenen Angaben (Hosting-Standort etc. bleiben bewusst unerwähnt, siehe Plan Task 7). Seit Audit W (N7) oben ein
// Inhaltsverzeichnis und je Abschnitt zuerst nur der erste Absatz (LegalSection; Überschriften und Reihenfolge der
// Sprungmarken: lib/legalSections.js). legal: Betreiberangaben aus GET /api/config für „Rechte und Kontakt“.
export default function Datenschutz({ legal }) {
  return (
    <div className="legal-block">
      <LegalToc />

      <LegalSection id="anmeldung">
        <p>
          Die Anmeldung läuft über ein Cookie, das nur mit dieser Seite funktioniert (httpOnly, für Skripte nicht
          lesbar) und dessen Name sich je nach Instanz unterscheidet. Es merkt sich ausschließlich, wer angemeldet
          ist – keine Tracking- oder Werbe-Cookies.
        </p>
      </LegalSection>

      <LegalSection id="inhalte">
        <p>
          Gespeichert werden die Inhalte, die ihr selbst anlegt: Tiere, Erinnerungen (die Einträge der Chronik), Fotos,
          Kommentare und Pinnwand-Zettel. Benutzername und E-Mail-Adresse sind optional und nur für den eigenen Login gedacht;
          bei optionalen Benutzer-Logins merken wir uns außerdem den Zeitpunkt der letzten Anmeldung. Ist ein
          Zuhause über einen Einladungscode eines Partners entstanden, speichern wir, über welchen Partner das war.
        </p>
        <p>
          Zugangsschlüssel werden nicht im Klartext, sondern nur als Hash gespeichert – wir können sie nicht
          wiederherstellen oder erneut anzeigen. Einladungscodes werden ebenfalls als Hash gespeichert und
          zusätzlich verschlüsselt (AES-GCM) abgelegt, solange sie noch offen sind: so lässt sich ein Code im
          Admin-Bereich erneut anzeigen. Sobald ein Einladungscode eingelöst oder zurückgezogen wird, löschen wir die
          verschlüsselte Fassung – ab dann bleibt nur noch der Hash.
        </p>
      </LegalSection>

      <LegalSection id="standort">
        <p>
          Die Partnerliste (/partner) verwendet nur die eingegebene Postleitzahl und ausschließlich unsere eigene
          Partner-Datenbank – dafür wird kein Standort übermittelt und keine externe Suche angestoßen.
        </p>
        <p>
          Für die Karte „Tierheime & Hundeschulen in der Nähe“ (in „Entdecken“, für Partner im Fuß der Seite; nur angemeldet nutzbar) lässt sich wahlweise eine
          Postleitzahl eingeben oder – nur mit ausdrücklicher Zustimmung im Browser – der eigene, gerundete
          Standort verwenden. Der Standort wird dabei auf etwa 1 km gerundet, ausschließlich für diese eine Suche
          verwendet und nie gespeichert oder protokolliert. Postleitzahl und Umkreis der letzten Suche merkt sich
          euer Browser (localStorage) auf diesem Gerät, damit ihr sie nicht jedes Mal neu eingeben müsst.
        </p>
        <p>
          Die Suche läuft über unseren eigenen Server bei OpenStreetMap (Overpass-API): OpenStreetMap sieht dabei
          nur die Adresse unseres Servers und die gerundeten Koordinaten, niemals die IP-Adresse oder den genauen
          Standort der Nutzerin oder des Nutzers. Der Server speichert Treffer aus dieser Suche für etwa 7 Tage in
          einem Zwischenspeicher, je grob gerundeter ca. 5-km-Fläche – ohne Bezug zu einer bestimmten Person.
          Postleitzahl-Daten (GeoNames, CC BY 4.0) liegen lokal auf dem Server und erfordern keine externe Abfrage.
        </p>
      </LegalSection>

      <LegalSection id="tracker">
        <p>
          Diese Seite verwendet keine Analyse- oder Tracking-Dienste und keine externen Werbenetzwerke. Schriften
          werden selbst gehostet, es werden keine Skripte oder Schriften von fremden Servern (z. B. Google Fonts)
          nachgeladen.
        </p>
      </LegalSection>

      <LegalSection id="entdecken">
        <p>
          „Entdecken“ zeigt Hundeschulen, Tierheime, Futter-Empfehlungen und Spendenmöglichkeiten aus unserer eigenen
          Datenbank – gefiltert höchstens nach der eingegebenen Postleitzahl. Jede Empfehlung ist gekennzeichnet:
          „Anzeige“ (bezahlt oder mit Gegenleistung), „Empfehlung von …“ oder „Partner“.
        </p>
        <p>
          Links zu Partnern, Empfehlungen und Spendenseiten führen kurz über unseren eigenen Server (/r/…). Dabei
          zählen wir nur, wie oft ein Ziel angeklickt wurde – je Ziel und Tag eine Zahl, ohne Bezug zu einer Person.
          Es werden keine Cookies gesetzt und keine IP-Adressen oder Geräte-Kennungen gespeichert; Aufrufe von
          Suchmaschinen- und anderen Bots zählen nicht mit. Die aufgerufene Seite erfährt nicht, von welcher Seite
          bei uns ihr kommt.
        </p>
      </LegalSection>

      <LegalSection id="tierheime">
        <p>
          Ein Tierheim kann einen eigenen Steckbrief für ein vermittelbares Tier veröffentlichen (/t/…) – sichtbar sind
          dort nur die Erinnerungen, die das Tierheim ausdrücklich als öffentlich markiert. Diese Seiten sind für
          Suchmaschinen ausgeschlossen (noindex).
        </p>
        <p>
          Zieht ein Tier über einen Übergabe-Code in ein neues Zuhause um, wandert seine ganze bisherige Chronik
          mit um; das abgebende Tierheim bleibt als Herkunft sichtbar. Das neue Zuhause kann dem abgebenden Tierheim
          freiwillig erlauben, weiterhin mitzulesen – diese Einwilligung lässt sich jederzeit widerrufen und umfasst
          immer nur die nicht-privaten Erinnerungen. Solange es mitliest, sieht das Tierheim dabei auch den Namen des neuen
          Zuhauses.
        </p>
        <p>
          Öffentliche Happy Ends (Porträtfoto und die neueste nicht-private Erinnerung auf der Portalseite eines
          Tierheims) zeigen wir nur mit einer eigenen, separaten Einwilligung des neuen Zuhauses – nie Namen oder
          andere Angaben zu den Menschen dahinter. Ein Widerruf wirkt sofort; nur ein vom Browser bereits
          zwischengespeichertes Foto kann noch kurz sichtbar bleiben.
        </p>
      </LegalSection>

      <LegalSection id="partner-profile">
        <p>
          Partner (zum Beispiel Hundeschulen, Tierheime oder Hundesalons) pflegen ihr öffentliches Profil selbst. Sie
          können „Einblicke“ zeigen – Fotos mit Datum und kurzem Text aus ihrer Arbeit. Beim Hochladen bestätigen
          sie, dass die Halterinnen und Halter der gezeigten Tiere einverstanden sind; Personen, Nachnamen oder
          Adressen gehören nicht hinein. Fotos werden nur als JPG oder PNG angenommen, Kamera- und Standortdaten
          (EXIF) entfernen wir vor dem Speichern.
        </p>
        <p>
          Einblicke sind nur öffentlich sichtbar, solange das Profil veröffentlicht ist. Der Partner kann jeden
          Einblick jederzeit löschen; wer sein Tier auf einem Einblick wiederfindet und das nicht möchte, wendet sich
          an den Partner oder an uns – wir blenden den Einblick dann aus.
        </p>
      </LegalSection>

      <LegalSection id="nachrichten">
        <p>
          Über „Schreib uns“ auf dem Portal eines Partners oder auf dem Steckbrief eines Tiers könnt ihr dem Partner eine
          Nachricht schicken. Gespeichert werden dabei die Nachricht, eine E-Mail-Adresse oder Telefonnummer (mindestens
          eins davon, damit eine Antwort möglich ist), freiwillig ein Name und – wenn ihr vom Steckbrief aus schreibt –
          auf welches Tier sich die Anfrage bezieht.
        </p>
        <p>
          Die Nachricht sieht nur der Partner selbst, in seinem Bereich unter „Nachrichten“; sie erscheint nirgends
          öffentlich. Wir verschicken dafür keine E-Mails – die Antwort kommt direkt vom Partner. Nachrichten werden nach
          180 Tagen automatisch gelöscht, der Partner kann sie auch früher löschen. Gegen Missbrauch begrenzen wir, wie
          viele Nachrichten in kurzer Zeit von einem Anschluss aus verschickt werden können; die Inhalte und Kontaktdaten
          landen dabei nicht in Protokollen.
        </p>
      </LegalSection>

      {/* Phase N: Anfragen (Gutschein, Partner-Zugang) und Telegram-Benachrichtigungen des Betreibers. */}
      <PrivacyRequests />

      {/* Audit V7a: Besuche, "Erlebt mit", Telegram für Partner, Hinweis-Band, Sicherungen. */}
      <PrivacyConnections />

      {/* Digitaler Bilderrahmen: Diashow und Rahmen-Link für ein anderes Gerät. */}
      <PrivacyBilderrahmen />

      <LegalSection id="suche">
        <p>
          Die Suche (Lupe oben) findet nur, was ihr ohnehin sehen dürft. Ein Suchbegriff geht nur für diese eine Suche an
          unseren Server; wir speichern und protokollieren Suchbegriffe nicht. Die letzten fünf Suchen merkt sich nur euer
          Browser auf diesem Gerät (localStorage) – bis ihr euch abmeldet oder in der Suche „Verlauf löschen“ wählt.
        </p>
      </LegalSection>

      <LegalSection id="rechte">
        <p>
          Für Auskunft über gespeicherte Daten oder deren Löschung wendet euch bitte an{' '}
          {legal?.email ? (
            <a href={`mailto:${legal.email}`}>{legal.email}</a>
          ) : (
            <>
              die im <Link to="/impressum">Impressum</Link> genannte Adresse
            </>
          )}
          .
        </p>
      </LegalSection>
    </div>
  )
}
