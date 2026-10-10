import { GESCHENK_TITEL, GESCHENK_UNTERZEILE } from '../../lib/geschenkkarte.js'
import { t } from '../../lib/i18n/index.js'

// Vorderseite der Geschenkkarte (lib/geschenkkarte.js): Papier, ein kleines Pfotenherz mit Schleife (gezeichnet, keine
// Clip-Art), die Überschrift und „Für …“/„Von …“ zum Ausfüllen von Hand. Gestaltet von Familie auf Pfoten, ohne Code -
// der steht nur hinten. a6: die Familienkarte (A6 quer, gefaltet); ohne: Visitenkartenformat im Partner-Designer.

export function PfotenherzSchleife({ className = 'gk-motiv' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {/* Schleife: zwei Schlaufen und zwei Bänder über dem Herz */}
      <path className="gk-band" d="M32 15c-5-7-14-9-15-3s9 5 15 3zM32 15c5-7 14-9 15-3s-9 5-15 3z" />
      <path className="gk-band" d="M30.5 16l-5 9M33.5 16l5 9" fill="none" />
      <circle className="gk-knoten" cx="32" cy="15.5" r="2.4" />
      {/* Herz */}
      <path className="gk-herz" d="M32 58C18 48 9 40 9 30c0-6 4.5-10.5 10-10.5 5 0 9 3 13 7.5 4-4.5 8-7.5 13-7.5 5.5 0 10 4.5 10 10.5 0 10-9 18-23 28z" />
      {/* Pfote im Herz */}
      <g className="gk-pfote">
        <ellipse cx="25" cy="33" rx="2.6" ry="3.4" />
        <ellipse cx="30" cy="29.5" rx="2.6" ry="3.4" />
        <ellipse cx="35" cy="29.5" rx="2.6" ry="3.4" />
        <ellipse cx="40" cy="33" rx="2.6" ry="3.4" />
        <path d="M32.5 37c4 0 7.5 3.5 7.5 6.5 0 2.5-2 3.5-4 3.5-1.5 0-2.3-.8-3.5-.8s-2 .8-3.5.8c-2 0-4-1-4-3.5 0-3 3.5-6.5 7.5-6.5z" />
      </g>
    </svg>
  )
}

function Ausfuellen({ label }) {
  return (
    <p className="gk-zeile">
      <span className="gk-zeile-label">{label}</span>
      <span className="gk-linie" aria-hidden="true" />
    </p>
  )
}

export default function GeschenkFront({ a6 = false }) {
  return (
    <article className={`vk-card gk-card gk-front${a6 ? ' gk-a6' : ''}`} aria-label={t('Vorderseite der Geschenkkarte')}>
      <span className="gk-ecke" aria-hidden="true" />
      <PfotenherzSchleife />
      <div className="gk-front-text">
        <p className="gk-marke">Familie auf Pfoten</p>
        <p className="gk-titel">{t(GESCHENK_TITEL)}</p>
        <p className="gk-unterzeile">{t(GESCHENK_UNTERZEILE)}</p>
        <div className="gk-zeilen">
          <Ausfuellen label={t('Für')} />
          <Ausfuellen label={t('Von')} />
        </div>
      </div>
    </article>
  )
}
