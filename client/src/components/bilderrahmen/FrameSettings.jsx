import '../../styles/bilderrahmen-optionen.css'
import { INTERVALLE, NIGHT_FROM_HOUR, NIGHT_UNTIL_HOUR } from '../../lib/bilderrahmen.js'
import { t, tOr } from '../../lib/i18n/index.js'

const SWITCHES = [
  { key: 'untertitel', label: 'Name und Datum zeigen' },
  { key: 'erinnerung', label: '„In Erinnerung“ bei verstorbenen Tieren' },
  { key: 'uhr', label: 'Uhr und Datum' },
  { key: 'nacht', label: 'Nachts dunkler ({from}–{until} Uhr)' },
  { key: 'heuteZuerst', label: '„Heute vor … Jahren“ zuerst' },
  { key: 'mischen', label: 'Zufällige Reihenfolge' }
]

const WAKE_HINTS = {
  aktiv: 'Der Bildschirm bleibt an, solange der Bilderrahmen läuft.',
  bereit: 'Der Bildschirm bleibt an, solange der Bilderrahmen sichtbar ist.',
  'nicht-verfuegbar': 'Dieser Browser kann den Bildschirm nicht anlassen – stellt am Gerät die automatische Sperre aus.',
  abgelehnt: 'Der Browser lässt den Bildschirm gerade nicht anlassen – stellt am Gerät die automatische Sperre aus.'
}

// Inhalt des Einstellungs-Blatts: Wechsel-Abstand, was zu sehen ist, Reihenfolge - darunter children (angemeldet: welche
// Tiere und welcher Zeitraum, FrameAuswahl). Jede Änderung gilt sofort. Auch im Formular für einen Rahmen-Link
// (RahmenGeraetForm) - dort ohne wakeLock (kein Hinweis) und mit eigenem idPrefix für die Radio-Gruppe.
export default function FrameSettings({ optionen, onChange, wakeLock, idPrefix = 'frame', children }) {
  const set = (key, value) => onChange({ ...optionen, [key]: value })
  return (
    <div className="frame-settings">
      <fieldset className="frame-settings-group">
        <legend>{t('Wechsel alle')}</legend>
        <div className="frame-choice-row">
          {INTERVALLE.map((seconds) => (
            <label key={seconds} className={`frame-choice${optionen.intervall === seconds ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name={`${idPrefix}-intervall`}
                value={seconds}
                checked={optionen.intervall === seconds}
                onChange={() => set('intervall', seconds)}
              />
              {seconds} s
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="frame-settings-group">
        <legend>{tOr('frame.anzeige', 'Anzeige')}</legend>
        {SWITCHES.map(({ key, label }) => (
          <label key={key} className="check">
            <input type="checkbox" checked={Boolean(optionen[key])} onChange={(event) => set(key, event.target.checked)} />
            {t(label, { from: NIGHT_FROM_HOUR, until: NIGHT_UNTIL_HOUR })}
          </label>
        ))}
      </fieldset>
      {children}
      {wakeLock && <p className="field-hint">{t(WAKE_HINTS[wakeLock] || WAKE_HINTS.bereit)}</p>}
    </div>
  )
}
