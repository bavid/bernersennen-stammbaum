import GeschenkBack from './GeschenkBack.jsx'
import GeschenkFront from './GeschenkFront.jsx'
import { GESCHENK_BOGEN_MM, geschenkCropMarks } from '../../lib/geschenkkarte.js'
import { t } from '../../lib/i18n/index.js'

// Ein A4-Bogen mit EINER Geschenkkarte für Familien: oben die Vorderseite, darunter die Rückseite (je A6 quer), dazwischen
// die gestrichelte Falzlinie, außen Schnittmarken. Einseitig drucken, ausschneiden, an der Linie nach hinten falten - so
// steht die Rückseite beim Umdrehen aufrecht. Gleiche Bogen-Klassen wie die Visitenkarten (styles/visitenkarten.css
// druckt .vk-print .vk-sheet als ein A4-Blatt).

const MARKS = geschenkCropMarks()
const { left, top, width, height } = GESCHENK_BOGEN_MM

export default function GeschenkkarteBogen({ code, qrUrl, adresse, muster }) {
  return (
    <section className="vk-sheet gk-sheet" aria-label={t('Geschenkkarte zum Drucken')}>
      <svg className="vk-cropmarks" viewBox="0 0 210 297" aria-hidden="true">
        {MARKS.map((mark) => (
          <line key={`${mark.x1}-${mark.y1}-${mark.x2}-${mark.y2}`} {...mark} />
        ))}
        <line className="gk-falz" x1={left} y1={top + height / 2} x2={left + width} y2={top + height / 2} />
      </svg>
      <span className="vk-sheet-label gk-sheet-label" aria-hidden="true">
        {t('Ausschneiden, an der gestrichelten Linie nach hinten falten')}
      </span>
      <div className="gk-sheet-karte">
        <GeschenkFront a6 />
        <GeschenkBack a6 code={code} qrUrl={qrUrl} adresse={adresse} muster={muster} />
      </div>
    </section>
  )
}
