import useSpendenLive from '../../hooks/useSpendenLive.js'
import { formatEuroCents } from '../../lib/discover.js'
import {
  aufteilungText,
  deckungFuellstand,
  deckungText,
  eintragText,
  hatLiveDaten,
  kategorienText,
  vorleistungText
} from '../../lib/spendenLive.js'
import { t } from '../../lib/i18n/index.js'
import { Card, Chip } from '../ui/index.js'

// „Spenden live“ auf /finanzierung: groß die Spenden dieses Monats gegen die laufenden Kosten (Balken und ein ruhiger Satz),
// darunter Jahr und seit dem Start, was nach der Regel mit dem Geld passiert (Kosten -> Anschub -> Rücklage -> weiter),
// der Anschub mit seinem gedeckten Teil und die Liste „Zuletzt gespendet“. Live über useSpendenLive (SSE, sonst alle
// 60 s); die Live-Region sagt nur eine geänderte Monatssumme an. finanz: GET /api/finanzierung (Rücklage, Posten) - darf
// fehlen. Ohne Spenden, Kosten und Anschub zeigt der Block nichts.
function ZuletztGespendet({ letzte }) {
  if (!letzte.length) return <p className="muted">{t('Noch keine öffentlichen Spenden in letzter Zeit.')}</p>
  return (
    <ul className="spenden-live-liste">
      {letzte.map((eintrag, index) => (
        <li key={`${eintrag.erfasst}-${index}`} className="spenden-live-eintrag">
          <span className="spenden-live-eintrag-kopf">{eintragText(eintrag)}</span>
          {eintrag.nachricht && <q className="spenden-live-nachricht">{eintrag.nachricht}</q>}
        </li>
      ))}
    </ul>
  )
}

function Kennzahlen({ live, finanz }) {
  const kategorien = kategorienText(finanz?.kosten?.posten)
  return (
    <dl className="spenden-live-zahlen">
      <div>
        <dt>{t('Dieses Jahr')}</dt>
        <dd>{formatEuroCents(live.summeJahr)}</dd>
      </div>
      <div>
        <dt>{t('Seit dem Start')}</dt>
        <dd>{formatEuroCents(live.summeGesamt)}</dd>
      </div>
      <div>
        <dt>{t('Laufende Kosten im Monat')}</dt>
        <dd>
          {formatEuroCents(live.kostenMonat)}
          {kategorien && <span className="spenden-live-kategorien">{kategorien}</span>}
        </dd>
      </div>
    </dl>
  )
}

export default function SpendenLive({ finanz = null }) {
  const { live, ansage } = useSpendenLive()
  if (!hatLiveDaten(live)) return null
  const anschub = vorleistungText(live.vorleistung)

  return (
    <section className="finanz-section spenden-live" aria-labelledby="spenden-live-title">
      <div className="spenden-live-kopf">
        <h2 id="spenden-live-title">{t('Spenden live')}</h2>
        <Chip tone="ok" className="spenden-live-chip">
          <span className="spenden-live-punkt" aria-hidden="true" />
          {t('aktuell')}
        </Chip>
        {live.demo && <Chip tone="neu">{t('Beispielzahlen')}</Chip>}
      </div>

      <Card variant="tinted" pad="lg" className="spenden-live-karte">
        <p className="spenden-live-summe">
          <strong>{formatEuroCents(live.summeMonat)}</strong>
          <span>{t('Spenden diesen Monat')}</span>
        </p>
        <span className="spenden-live-bar" aria-hidden="true">
          <span className="spenden-live-fill" style={{ transform: `scaleX(${deckungFuellstand(live.deckungProzent) / 100})` }} />
        </span>
        <p className="spenden-live-deckung">{deckungText(live.deckungProzent)}</p>
        <p className="visually-hidden" aria-live="polite">
          {ansage}
        </p>
      </Card>

      <Kennzahlen live={live} finanz={finanz} />
      <p className="spenden-live-aufteilung">{aufteilungText(live, finanz)}</p>
      {anschub && (
        <p className="spenden-live-anschub">
          {anschub}
          <span className="muted"> {t('– vorgestreckte Kosten, die nach und nach aus Spenden gedeckt werden.')}</span>
        </p>
      )}

      <h3 className="spenden-live-zuletzt">{t('Zuletzt gespendet')}</h3>
      <ZuletztGespendet letzte={live.letzte} />
    </section>
  )
}
