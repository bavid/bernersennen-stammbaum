import VisitenkarteQr from '../visitenkarte/VisitenkarteQr.jsx'
import { t } from '../../lib/i18n/index.js'

// Die drei A4-Seiten des Tierheim-Startpakets (lib/startpaket.js buildStartpaket): Steckbrief, erste Erinnerungen,
// Übergabe-QR. Die Bögen nutzen .voucher-sheet aus print.css (A4, 10 mm Rand, eine Seite je Bogen); Farben fest wie
// auf Papier (styles/startpaket.css). Der Code steht nur im QR und in einer Zeile, die erst beim Drucken erscheint.

export const STARTPAKET_FOOTER = 'Heute kostenlos. Keine fremde Werbung, kein Tracking, kein Datenhandel.'
export const NEXT_STEPS = [
  'Handy-Kamera auf den QR-Code richten und die Seite öffnen.',
  'Ein Zuhause anlegen oder anmelden – das dauert eine Minute.',
  'Code bestätigen: {name} zieht mit allen Erinnerungen zu euch.',
  'Ab jetzt schreibt ihr die Chronik weiter – mit Fotos, Grüßen und allem, was ihr erlebt.'
]

function ShelterMark({ shelter }) {
  return (
    <p className="startpaket-shelter">
      {shelter.logoUrl && <img src={shelter.logoUrl} alt="" width="40" height="40" />}
      <span>{shelter.name}</span>
    </p>
  )
}

function Sheet({ label, shelter, children }) {
  return (
    <section className="voucher-sheet startpaket-sheet" aria-label={label}>
      <ShelterMark shelter={shelter} />
      <div className="startpaket-body">{children}</div>
      <p className="startpaket-footer">{t(STARTPAKET_FOOTER)}</p>
    </section>
  )
}

function ProfileSheet({ profile, shelter }) {
  const facts = [
    [t('Tierart'), profile.species],
    [t('Geboren'), profile.birth ? `${profile.birth}${profile.age ? ` · ${profile.age}` : ''}` : t('unbekannt')]
  ]
  return (
    <Sheet label={t('Seite 1: Steckbrief')} shelter={shelter}>
      <p className="startpaket-eyebrow">{t('Steckbrief')}</p>
      {profile.photo && <img className="startpaket-portrait" src={profile.photo} alt={profile.name} />}
      <h2 className="startpaket-name">{profile.name}</h2>
      {profile.fullName && profile.fullName !== profile.name && <p className="startpaket-fullname">{profile.fullName}</p>}
      <dl className="startpaket-facts">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {profile.text && <p className="startpaket-text">{profile.text}</p>}
    </Sheet>
  )
}

function MemoriesSheet({ memories, shelter, name }) {
  return (
    <Sheet label={t('Seite 2: Erste Erinnerungen')} shelter={shelter}>
      <p className="startpaket-eyebrow">{t('Erste Erinnerungen')}</p>
      <h2 className="startpaket-title">{t('Die ersten Erinnerungen mit {name}', { name })}</h2>
      {memories.length === 0 ? (
        <p className="startpaket-text">{t('Hier ist noch Platz – die ersten Erinnerungen schreibt ihr selbst.')}</p>
      ) : (
        <ol className={`startpaket-memories count-${memories.length}`}>
          {memories.map((memory) => (
            <li key={memory.id} className="startpaket-memory">
              {memory.photo && <img src={memory.photo} alt="" />}
              <time dateTime={memory.iso}>{memory.date}</time>
              <strong>{memory.title}</strong>
              {memory.text && <p>{memory.text}</p>}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}

function HandoverSheet({ handover, shelter, name }) {
  return (
    <Sheet label={t('Seite 3: Übergabe')} shelter={shelter}>
      <p className="startpaket-eyebrow">{t('Übergabe')}</p>
      <h2 className="startpaket-title">{t('Willkommen zu Hause, {name}!', { name })}</h2>
      <div className={`startpaket-qr${handover?.muster ? ' is-muster' : ''}`}>
        {handover ? (
          <>
            <VisitenkarteQr url={handover.qrUrl} label={t('QR-Code zur Übergabe')} />
            {handover.muster && <span className="startpaket-muster">{t('Muster')}</span>}
            <p className="startpaket-code print-only">
              {t('Übergabe-Code')}: <span>{handover.code}</span>
            </p>
          </>
        ) : (
          <p className="startpaket-qr-empty">{t('Hier erscheint der QR-Code, sobald ein Übergabe-Code erzeugt ist.')}</p>
        )}
      </div>
      <h3 className="startpaket-steps-title">{t('So geht’s weiter')}</h3>
      <ol className="startpaket-steps">
        {NEXT_STEPS.map((step) => (
          <li key={step}>{t(step, { name })}</li>
        ))}
      </ol>
    </Sheet>
  )
}

export default function StartpaketSheets({ model }) {
  const { profile, shelter, memories, handover } = model
  return (
    <div className="voucher-sheets startpaket-sheets">
      <ProfileSheet profile={profile} shelter={shelter} />
      <MemoriesSheet memories={memories} shelter={shelter} name={profile.name} />
      <HandoverSheet handover={handover} shelter={shelter} name={profile.name} />
    </div>
  )
}
