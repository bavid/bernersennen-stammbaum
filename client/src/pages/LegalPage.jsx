import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import PrivacyRequests from '../components/PrivacyRequests.jsx'
import PrivacyConnections from '../components/PrivacyConnections.jsx'
import PrivacyBilderrahmen from '../components/PrivacyBilderrahmen.jsx'

const NO_LEGAL_HINT = 'Die Betreiberangaben werden vor dem Start ergänzt.'

function hasLegalData(legal) {
  return Boolean(legal?.name || legal?.address)
}

// Reiner Text (nie HTML) - Zeilenumbrüche der Adresse (server: IMPRESSUM_ADRESSE, \n -> echter
// Zeilenumbruch, siehe config.js readLegal) werden zu eigenen Absätzen.
function linesOf(text) {
  return (text || '').split('\n').map((line) => line.trim()).filter(Boolean)
}

function Impressum({ legal }) {
  if (!hasLegalData(legal)) {
    return <p>{NO_LEGAL_HINT}</p>
  }
  return (
    <div className="legal-block">
      {legal.name && <p>{legal.name}</p>}
      {legal.address && (
        <p>
          {linesOf(legal.address).map((line, index) => (
            <span key={index}>
              {line}
              <br />
            </span>
          ))}
        </p>
      )}
      {legal.email && (
        <p>
          <a href={`mailto:${legal.email}`}>{legal.email}</a>
        </p>
      )}
      {legal.phone && <p>{legal.phone}</p>}
    </div>
  )
}

// Fester, sachlicher Text darüber, was die App tatsächlich tut - keine Textbausteine mit erfundenen
// Angaben (Hosting-Standort etc. bleiben bewusst unerwähnt, siehe Plan Task 7).
function Datenschutz({ legal }) {
  return (
    <div className="legal-block">
      <h2>Anmeldung</h2>
      <p>
        Die Anmeldung läuft über ein Cookie, das nur mit dieser Seite funktioniert (httpOnly, für Skripte nicht
        lesbar) und dessen Name sich je nach Instanz unterscheidet. Es merkt sich ausschließlich, wer angemeldet
        ist – keine Tracking- oder Werbe-Cookies.
      </p>

      <h2>Gespeicherte Inhalte</h2>
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

      <h2>Standort und Umkreissuche</h2>
      <p>
        Die Partnerliste (/partner) verwendet nur die eingegebene Postleitzahl und ausschließlich unsere eigene
        Partner-Datenbank – dafür wird kein Standort übermittelt und keine externe Suche angestoßen.
      </p>
      <p>
        Für „Tierheime & Hundeschulen in der Nähe“ (/umgebung, nur angemeldet nutzbar) lässt sich wahlweise eine
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

      <h2>Keine Tracker, keine fremden Dienste</h2>
      <p>
        Diese Seite verwendet keine Analyse- oder Tracking-Dienste und keine externen Werbenetzwerke. Schriften
        werden selbst gehostet, es werden keine Skripte oder Schriften von fremden Servern (z. B. Google Fonts)
        nachgeladen.
      </p>

      <h2>Entdecken und Empfehlungen</h2>
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

      <h2>Tierheime</h2>
      <p>
        Ein Tierheim kann einen eigenen Steckbrief für ein vermittelbares Tier veröffentlichen (/t/…) – sichtbar sind
        dort nur die Erinnerungen, die das Tierheim ausdrücklich als öffentlich markiert. Diese Seiten sind für
        Suchmaschinen ausgeschlossen (noindex).
      </p>
      <p>
        Zieht ein Tier über einen Übergabe-Code in ein neues Zuhause um, wandert seine ganze bisherige Chronik
        mit um; das abgebende Tierheim bleibt als Herkunft sichtbar. Das neue Zuhause kann dem abgebenden Tierheim
        freiwillig erlauben, weiterhin mitzulesen – diese Einwilligung lässt sich jederzeit widerrufen und umfasst
        immer nur die nicht-privaten Erinnerungen.
      </p>
      <p>
        Öffentliche Happy Ends (Porträtfoto und die neueste nicht-private Erinnerung auf der Portalseite eines
        Tierheims) zeigen wir nur mit einer eigenen, separaten Einwilligung des neuen Zuhauses – nie Namen oder
        andere Angaben zu den Menschen dahinter. Ein Widerruf wirkt sofort; nur ein vom Browser bereits
        zwischengespeichertes Foto kann noch kurz sichtbar bleiben.
      </p>

      <h2>Partner-Profile und Einblicke</h2>
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

      <h2>Nachrichten an Partner</h2>
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

      {/* Phase N: Anfragen (Gutschein, Partner-Zugang) und Telegram-Benachrichtigungen des Betreibers. */}
      <PrivacyRequests />

      {/* Audit V7a: Besuche, "Erlebt mit", Telegram für Partner, Hinweis-Band, Sicherungen. */}
      <PrivacyConnections />

      {/* Digitaler Bilderrahmen: Diashow und Rahmen-Link für ein anderes Gerät. */}
      <PrivacyBilderrahmen />

      <h2>Suche</h2>
      <p>
        Die Suche (Lupe oben) findet nur, was ihr ohnehin sehen dürft. Ein Suchbegriff geht nur für diese eine Suche an
        unseren Server; wir speichern und protokollieren Suchbegriffe nicht. Die letzten fünf Suchen merkt sich nur euer
        Browser auf diesem Gerät (localStorage) – bis ihr euch abmeldet oder in der Suche „Verlauf löschen“ wählt.
      </p>

      <h2>Rechte und Kontakt</h2>
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
    </div>
  )
}

const COPY = {
  impressum: { title: 'Impressum', Body: Impressum },
  datenschutz: { title: 'Datenschutz', Body: Datenschutz }
}

// /impressum und /datenschutz - öffentlich, Standard-Theme (siehe App.jsx). legal kommt aus
// GET /api/config (server/config.js readLegal, aus IMPRESSUM_* - siehe .env.example). family: die laufende
// Sitzung oder null - "Zurück" (PublicHeader) führt ohne Verlauf dann zur Startseite des Bereichs.
export default function LegalPage({ variant, family = null }) {
  const [legal, setLegal] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    api
      .config()
      .then((data) => {
        if (!cancelled) setLegal(data.legal || null)
      })
      .catch(() => {
        if (!cancelled) setLegal(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { title, Body } = COPY[variant] || COPY.impressum

  return (
    <div className="public-page legal-page">
      <PublicHeader family={family} />
      <div className="legal-hero">
        <span className="eyebrow">Rechtliches</span>
        <h1>{title}</h1>
      </div>

      {legal === undefined ? (
        <p className="muted" aria-busy="true">
          Lädt …
        </p>
      ) : (
        <Body legal={legal} />
      )}

      <PublicFooter />
    </div>
  )
}
