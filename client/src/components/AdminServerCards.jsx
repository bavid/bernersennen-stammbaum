import {
  AMPEL_LABELS,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatLoad,
  formatPercent,
  formatTime,
  relativeTime
} from '../lib/adminServer.js'

const BACKUP_ART_LABELS = Object.freeze({ auto: 'automatisch (täglich)', deploy: 'vor einem Deploy' })

// Ampel als Punkt UND Wort ("ok", "erhöht", "kritisch") - die Farbe ist nie das einzige Signal.
function Ampel({ stufe }) {
  return (
    <span className={`server-ampel is-${stufe}`}>
      <span className="server-ampel-dot" aria-hidden="true" />
      <span className="visually-hidden">Ampel: </span>
      {AMPEL_LABELS[stufe]}
    </span>
  )
}

function Rows({ rows }) {
  const visible = rows.filter(Boolean)
  if (visible.length === 0) return null
  return (
    <dl className="server-card-rows">
      {visible.map(([label, value, nested]) => (
        <div key={label} className={nested ? 'is-nested' : undefined}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// Eine Karte: Titel, optional Ampel und großer Wert, darunter die Einzelwerte und ein kleiner Hinweis.
function ServerCard({ id, title, ampel, value, unit, rows = [], hint }) {
  const titleId = `admin-server-${id}-title`
  return (
    <article className={`server-card is-${ampel ?? 'info'}`} aria-labelledby={titleId}>
      <header className="server-card-head">
        <h3 id={titleId}>{title}</h3>
        {ampel && <Ampel stufe={ampel} />}
      </header>
      {value && (
        <p className="server-card-value">
          {value} {unit && <small>{unit}</small>}
        </p>
      )}
      <Rows rows={rows} />
      {hint && <p className="server-card-hint muted">{hint}</p>}
    </article>
  )
}

function percentHint({ gelb, rot }) {
  return `Erhöht über ${formatPercent(gelb)}, kritisch über ${formatPercent(rot)} belegt.`
}

function SpeicherCard({ speicher, schwelle }) {
  if (!speicher) return <ServerCard id="speicher" title="Arbeitsspeicher" hint="Gerade nicht messbar." />
  return (
    <ServerCard
      id="speicher"
      title="Arbeitsspeicher"
      ampel={speicher.ampel}
      value={formatPercent(speicher.belegtProzent)}
      unit="belegt"
      rows={[
        ['Gesamt', formatBytes(speicher.gesamt)],
        ['Verfügbar', formatBytes(speicher.verfuegbar)],
        Number.isFinite(speicher.app) && ['Davon diese App', formatBytes(speicher.app)]
      ]}
      hint={percentHint(schwelle)}
    />
  )
}

function PlatteCard({ platte, schwelle }) {
  if (!platte) return <ServerCard id="platte" title="Speicherplatz" hint="Gerade nicht messbar." />
  return (
    <ServerCard
      id="platte"
      title="Speicherplatz"
      ampel={platte.ampel}
      value={formatPercent(platte.belegtProzent)}
      unit="belegt"
      rows={[
        ['Gesamt', formatBytes(platte.gesamt)],
        ['Frei', formatBytes(platte.frei)]
      ]}
      hint={percentHint(schwelle)}
    />
  )
}

function LastCard({ last, schwelle }) {
  if (!last) return <ServerCard id="last" title="Last" hint="Gerade nicht messbar." />
  const kerne = last.kerne === 1 ? '1 Kern' : `${last.kerne} Kernen`
  return (
    <ServerCard
      id="last"
      title="Last"
      ampel={last.ampel}
      value={formatLoad(last.load1)}
      unit="(1 Minute)"
      rows={[
        ['CPU-Kerne', String(last.kerne)],
        ['5 Minuten', formatLoad(last.load5)],
        ['15 Minuten', formatLoad(last.load15)],
        ['Je Kern', formatLoad(last.proKern)]
      ]}
      hint={`Erhöht über ${formatLoad(schwelle.gelb * last.kerne)}, kritisch über ${formatLoad(schwelle.rot * last.kerne)} (bei ${kerne}).`}
    />
  )
}

function GroessenCard({ groessen }) {
  if (!groessen) {
    return <ServerCard id="groessen" title="Größe" hint="Wird gerade ermittelt – bitte gleich noch einmal aktualisieren." />
  }
  return (
    <ServerCard
      id="groessen"
      title="Größe"
      rows={[
        ['Datenbank', formatBytes(groessen.datenbank)],
        ['Fotos', formatBytes(groessen.fotos)],
        ['davon Chronik und Steckbriefe', formatBytes(groessen.chronikFotos), true],
        ['davon Partner-Bilder', formatBytes(groessen.partnerBilder), true],
        ['Sicherungen', formatBytes(groessen.sicherungen)]
      ]}
      hint={`Stündlich ermittelt, zuletzt um ${formatTime(groessen.berechnetAt)}.`}
    />
  )
}

function StandCard({ stand }) {
  const backup = stand?.letztesBackup
  const when = backup && (
    <>
      {formatDateTime(backup.at)} <small className="server-card-sub">({relativeTime(backup.at)})</small>
    </>
  )
  return (
    <ServerCard
      id="stand"
      title="Stand"
      rows={[
        ['Version', stand?.version ? <code>{stand.version}</code> : 'unbekannt'],
        ['Letztes Backup', when || 'noch keins'],
        backup && ['Größe', formatBytes(backup.bytes)],
        backup && ['Art', BACKUP_ART_LABELS[backup.art] ?? backup.art]
      ]}
    />
  )
}

// Die Karten des Reiters „Server“: oben die drei Messwerte mit Ampel, darunter Größen, Laufzeit und Stand.
export default function AdminServerCards({ status }) {
  const { speicher, platte, last, laufzeit, groessen, stand, schwellen } = status
  return (
    <>
      <div className="admin-server-grid is-primary">
        <SpeicherCard speicher={speicher} schwelle={schwellen.speicher} />
        <PlatteCard platte={platte} schwelle={schwellen.platte} />
        <LastCard last={last} schwelle={schwellen.last} />
      </div>
      <div className="admin-server-grid is-secondary">
        <GroessenCard groessen={groessen} />
        <ServerCard
          id="laufzeit"
          title="Laufzeit"
          rows={[
            ['Server', formatDuration(laufzeit?.server)],
            ['App', formatDuration(laufzeit?.app)]
          ]}
        />
        <StandCard stand={stand} />
      </div>
    </>
  )
}
