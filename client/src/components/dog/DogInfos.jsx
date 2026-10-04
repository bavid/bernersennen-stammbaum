import { companionLine, herkunftText } from '../../lib/companions.js'
import { withShareChange } from '../../lib/animalCounts.js'
import { ageText, formatDateLong } from '../../lib/dates.js'
import { displayName, sexLabel, speciesLabel } from '../../lib/timeline.js'
import Icon from '../Icon.jsx'
import SharePanel from '../SharePanel.jsx'
import ShelterSharePanel from '../ShelterSharePanel.jsx'
import TakeOverPanel from '../TakeOverPanel.jsx'
import DogRelatives from './DogRelatives.jsx'

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
// Abschied) und wo es lebt. Für ein geteiltes Tier im fremden Bereich (!dog.canEdit) "Im {Zuhause}" statt "Bei euch".
function DogFacts({ dog }) {
  const age = dog.geburtsdatum && !dog.bei_uns_bis ? ageText(dog.geburtsdatum) : null
  const stay = companionLine(dog, !dog.canEdit ? { ownerName: dog.familyName } : undefined)
  const sex = sexLabel(dog.geschlecht, dog.tierart)
  // Geschlecht „weiß ich nicht“: „unbekannt“ wie ein fehlender Geburtstag - nie Hündin oder Rüde.
  const kind = !sex ? <span className="muted">unbekannt</span> : dog.tierart === 'anderes' ? `${speciesLabel(dog.tierart)} · ${sex}` : sex
  return (
    <dl className="facts dog-info-facts">
      <Fact label="Rasse">{dog.rasse || <span className="muted">nicht angegeben</span>}</Fact>
      <Fact label="Geschlecht">{kind}</Fact>
      <Fact label="Geboren">
        {dog.geburtsdatum ? formatDateLong(dog.geburtsdatum) : <span className="muted">unbekannt</span>}
        {age && <span className="muted"> · {age}</span>}
      </Fact>
      <Fact label="Zuhause">{dog.familyName}</Fact>
      {dog.farbe_markings && (
        <Fact label="Farbe &amp; Abzeichen" wide>
          {dog.farbe_markings}
        </Fact>
      )}
      {stay && (
        <Fact label="Gemeinsame Zeit" wide>
          <span className={`dog-hero-companion ${stay.memorial ? 'is-memorial' : ''}`}>
            {stay.memorial && <Icon name="heart" />} {stay.text}
          </span>
        </Fact>
      )}
      {!stay && herkunftText(dog) && (
        <Fact label="Herkunft" wide>
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
      <h2 className="visually-hidden">Infos zu {displayName(dog)}</h2>
      <DogFacts dog={dog} />
      {dog.beschreibung && <p className="dog-info-description">{dog.beschreibung}</p>}
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
    </div>
  )
}
