import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import PublicFooter from '../components/PublicFooter.jsx'

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
        Gespeichert werden die Inhalte, die ihr selbst anlegt: Tiere, Chronik-Einträge, Fotos, Kommentare und
        Pinnwand-Zettel. Benutzername und E-Mail-Adresse sind optional und nur für den eigenen Login gedacht.
        Gutschein-Codes und Zugangsschlüssel werden nicht im Klartext, sondern nur als Hash gespeichert.
      </p>

      <h2>Standort und Umkreissuche</h2>
      <p>
        Für „Tierheime & Hundeschulen in der Nähe“ und die Partnerliste lässt sich wahlweise eine Postleitzahl
        eingeben oder – nur mit ausdrücklicher Zustimmung im Browser – der eigene Standort verwenden. Der
        Standort wird dabei auf etwa 1 km gerundet, ausschließlich für diese eine Suche verwendet und nie
        gespeichert oder protokolliert.
      </p>
      <p>
        Die Suche läuft über unseren eigenen Server bei OpenStreetMap (Overpass-API): OpenStreetMap sieht dabei
        nur die Adresse unseres Servers und die gerundeten Koordinaten, niemals die IP-Adresse oder den genauen
        Standort der Nutzerin oder des Nutzers. Postleitzahl-Daten (GeoNames, CC BY 4.0) liegen lokal auf dem
        Server und erfordern keine externe Abfrage.
      </p>

      <h2>Keine Tracker, keine fremden Dienste</h2>
      <p>
        Diese Seite verwendet keine Analyse- oder Tracking-Dienste und keine externen Werbenetzwerke. Schriften
        werden selbst gehostet, es werden keine Skripte oder Schriften von fremden Servern (z. B. Google Fonts)
        nachgeladen.
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
// GET /api/config (server/config.js readLegal, aus IMPRESSUM_* - siehe .env.example).
export default function LegalPage({ variant }) {
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
      <header className="legal-hero">
        <ThemeMark size={56} />
        <span className="eyebrow">Rechtliches</span>
        <h1>{title}</h1>
      </header>

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
