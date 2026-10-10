import { companionLine, herkunftText } from '../../lib/companions.js'
import { withShareChange } from '../../lib/animalCounts.js'
import { stayOwnerName } from '../../lib/dogProfile.js'
import { ageText, formatDateLong } from '../../lib/dates.js'
import { displayName, sexLabel, speciesLabel } from '../../lib/timeline.js'
import Icon from '../Icon.jsx'
import SharePanel from '../SharePanel.jsx'
import ShelterSharePanel from '../ShelterSharePanel.jsx'
import TakeOverPanel from '../TakeOverPanel.jsx'
import DogRelatives from './DogRelatives.jsx'
import WirWarenHierInfos from '../wirWarenHier/WirWarenHierInfos.jsx'
import GesundheitInfos from './GesundheitInfos.jsx'
import { t } from '../../lib/i18n/index.js'

export const SHARE_PANEL_TITLE_ID = 'share-panel-title'
export const TAKE_OVER_ID = 'take-over'

function Fact({ label, wide = false, children }) {
  return (
    <div className={wide ? 'facts-wide' : undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// Die Angaben zum Tier: Art und Geschlecht, Rasse, Geburtstag samt Alter, Farbe, die Zeit bei euch (Einzug, Herkunft bzw.
// Abschied) und wo es lebt. Für ein Tier, das nicht euch gehört, "Im {Zuhause}" statt "Bei euch" (stayOwnerName - dieselbe
// Regel wie im Kopf; ein eigenes, in die Familie geteiltes Tier bleibt "Bei euch").
function DogFacts({ dog, family }) {
  const age = dog.geburtsdatum && !dog.bei_uns_bis ? ageText(dog.geburtsdatum) : null
  const ownerName = stayOwnerName(dog, family)
  const stay = companionLine(dog, ownerName ? { ownerName } : undefined)
  const sex = sexLabel(dog.geschlecht, dog.tierart)
  // Geschlecht „weiß ich nicht“: „unbekannt“ wie ein fehlender Geburtstag - nie Hündin oder Rüde.
  const kind = !sex ? <span className="muted">{t('unbekannt')}</span> : dog.tierart === 'anderes' ? `${t(speciesLabel(dog.tierart))} · ${t(sex)}` : t(sex)
  return (
    <dl className="facts dog-info-facts">
      <Fact label={t('Rasse')}>{dog.rasse || <span className="muted">{t('nicht angegeben')}</span>}</Fact>
      <Fact label={t('Geschlecht')}>{kind}</Fact>
      <Fact label={t('Geboren')}>
        {dog.geburtsdatum ? formatDateLong(dog.geburtsdatum) : <span className="muted">{t('unbekannt')}</span>}
        {age && <span className="muted"> · {age}</span>}
      </Fact>
      <Fact label={t('Zuhause')}>{dog.familyName}</Fact>
      {dog.farbe_markings && (
        <Fact label={t('Farbe & Abzeichen')} wide>
          {dog.farbe_markings}
        </Fact>
      )}
      {stay && (
        <Fact label={t('Gemeinsame Zeit')} wide>
          <span className={`dog-hero-companion ${stay.memorial ? 'is-memorial' : ''}`}>
            {stay.memorial && <Icon name="heart" />} {stay.text}
          </span>
        </Fact>
      )}
      {!stay && herkunftText(dog) && (
        <Fact label={t('Herkunft')} wide>
          {herkunftText(dog)}
        </Fact>
      )}
    </dl>
  )
}

// Reiter "Infos" der Tierseite (Phase W, Schritt 2): die Angaben, die ganze Beschreibung, "Wer sieht {Name}?" (die Freigabe
// in Familien - nur ein eigenes Tier im eigenen Zuhause), "Tierheim darf mitlesen" (nur mit abgebendem Tierheim) und für
// die Leitung "In „Mein Zuhause“ übernehmen". Ein Tierheim sieht hier zusätzlich Eltern und Mitbewohner (es hat keinen
// eigenen Reiter "Verwandte").
// Die key-Werte setzen den Zustand der Panels bei einem anderen Tier zurück - und müssen unter diesen Geschwistern
// eindeutig sein (V-Fehler 1: zweimal key={dog.id} ließ React Kopien im DOM zurück).
// embedRelatives: Eltern und Mitbewohner hier zeigen (eigene Tiere eines Tierheims - sie haben keinen Reiter "Verwandte").
export default function DogInfos({ dog, setDog, family, allDogs, canWrite, canTakeOver, reload, onFamilyChange, embedRelatives = false }) {
  const ownHomeAnimal = dog.canEdit && family.art === 'zuhause'

  // Neue Freigaben: im Tier und in den Zahlen von me (Familien-Liste, Start) - funktional, falls zwei Antworten kurz
  // nacheinander kommen.
  function handleSharesChange(shares) {
    onFamilyChange?.((current) => withShareChange(current, dog, dog.shares, shares))
    setDog((current) => ({ ...current, shares }))
  }
  return (
    <div className="dog-infos">
      <h2 className="visually-hidden">{t('Infos zu {name}', { name: displayName(dog) })}</h2>
      <DogFacts dog={dog} family={family} />
      {dog.beschreibung && <p className="dog-info-description">{dog.beschreibung}</p>}
      {/* „Gesundheit leicht“: letzte Impfung, Wurmkur, Tierarzt und der nächste Termin - nur beim eigenen Tier. */}
      {ownHomeAnimal && <GesundheitInfos key={`gesundheit-${dog.id}`} dog={dog} />}
      {embedRelatives && <DogRelatives dog={dog} setDog={setDog} family={family} allDogs={allDogs} canWrite={canWrite} reload={reload} embedded />}
      {canTakeOver && (
        <div id={TAKE_OVER_ID} tabIndex={-1} className="dog-infos-anchor">
          <TakeOverPanel key={`take-over-${dog.id}`} dog={dog} onTakenOver={reload} />
        </div>
      )}
      {ownHomeAnimal && (
        <SharePanel
          key={`share-${dog.id}`}
          dog={dog}
          family={family}
          onFamilyChange={onFamilyChange}
          onSharesChange={handleSharesChange}
        />
      )}
      {ownHomeAnimal && dog.shelterShare && (
        <ShelterSharePanel
          key={`shelter-share-${dog.id}`}
          dog={dog}
          onChange={(shelterShare) => setDog((current) => ({ ...current, shelterShare }))}
        />
      )}
      {/* „Wir waren hier“: wo das eigene Tier angemeldet ist (Plan 2026-10-10, Aufgabe 6) - dogTabs bleibt unverändert. */}
      {ownHomeAnimal && <WirWarenHierInfos key={`wwh-${dog.id}`} dog={dog} />}
    </div>
  )
}
