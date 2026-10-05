import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Datenschutz from '../components/legal/Datenschutz.jsx'
import { LegalProvider } from '../components/legal/LegalSection.jsx'

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

const COPY = {
  impressum: { title: 'Impressum', Body: Impressum },
  datenschutz: { title: 'Datenschutz', Body: Datenschutz }
}

// Eine Sprungmarke in der Adresse (#tierheime): der Abschnitt steht erst nach dem Laden im Dokument - dann dorthin rollen
// (der Browser hat beim Öffnen noch nichts gefunden). Nur einmal je Hash.
function useScrollToHash(ready) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!ready || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' })
  }, [ready, hash])
}

// /impressum und /datenschutz - öffentlich, Standard-Theme (siehe App.jsx). legal kommt aus
// GET /api/config (server/config.js readLegal, aus IMPRESSUM_* - siehe .env.example). family: die laufende
// Sitzung oder null - "Zurück" (PublicHeader) führt ohne Verlauf dann zur Startseite des Bereichs.
// Der Datenschutz (components/legal/Datenschutz.jsx) hat ein Inhaltsverzeichnis und eingeklappte Abschnitte;
// ?alles=1 bzw. eine Sprungmarke öffnen sie (LegalProvider).
export default function LegalPage({ variant, family = null }) {
  const [legal, setLegal] = useState(undefined)
  useScrollToHash(legal !== undefined)

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
        <LegalProvider>
          <Body legal={legal} />
        </LegalProvider>
      )}

      <PublicFooter />
    </div>
  )
}
