import { api } from '../../api'
import EinladungskartenDesigner from './EinladungskartenDesigner.jsx'
import KartenArtSwitch from './KartenArtSwitch.jsx'
import VisitenkartenDesigner from './VisitenkartenDesigner.jsx'
import useKartenEntwurf from '../../hooks/useKartenEntwurf.js'
import useVisitenkartenDruck from '../../hooks/useVisitenkartenDruck.js'
import { designPayload, isSameDesign } from '../../lib/visitenkarte.js'
import { ART, einladungPayload, isSameEinladung } from '../../lib/einladungskarte.js'

// Beide Kartenarten des Designers (PartnerVisitenkartenPage, ?art=einladung): Visitenkarte (VisitenkartenDesigner) und
// Einladungskarte (EinladungskartenDesigner). Hier leben, was ein Wechsel der Kartenart überstehen soll - beide Entwürfe
// (hooks/useKartenEntwurf.js, getrennt gespeichert: PUT /visitenkarte bzw. /visitenkarte/einladung) und der Druck mit
// den Zählern des Kunden-Stapels (hooks/useVisitenkartenDruck.js, ein Abruf für beide Arten). Die Wahl der Kartenart
// (KartenArtSwitch, onArt) steht hier, damit sie gesperrt ist, solange ein Druck seine Codes holt.

// Ältere Antwort ohne Einladungskarte: deren Vorgabe ist der Look der Visitenkarte ohne persönliche Zeile.
function einladungOf(initial) {
  return initial.einladung || { design: einladungPayload({ ...initial.design, widmung: '' }), gespeichert: false }
}

export default function KartenDesigner({ art, onArt, profile, initial, publicUrl }) {
  const druck = useVisitenkartenDruck(initial.gutscheine)
  const onSaved = (result) => druck.setGutscheine(result.gutscheine)
  const visitenkarte = useKartenEntwurf({
    initial: initial.design,
    gespeichert: initial.gespeichert,
    toPayload: designPayload,
    isSame: isSameDesign,
    request: (payload) => api.partnerArea.saveVisitenkarte(payload),
    pick: (result) => result.design,
    onSaved
  })
  const einladungInitial = einladungOf(initial)
  const einladung = useKartenEntwurf({
    initial: einladungInitial.design,
    gespeichert: einladungInitial.gespeichert,
    toPayload: einladungPayload,
    isSame: isSameEinladung,
    request: (payload) => api.partnerArea.saveEinladungskarte(payload),
    pick: (result) => result.einladung.design,
    onSaved
  })

  const shared = { profile, vorschlag: initial.vorschlag, publicUrl, druck }
  return (
    <>
      <KartenArtSwitch art={art} onChange={onArt} disabled={druck.busy} />
      {art === ART.einladung ? (
        <EinladungskartenDesigner {...shared} rueckseite={initial.rueckseite} entwurf={einladung} />
      ) : (
        <VisitenkartenDesigner {...shared} entwurf={visitenkarte} />
      )}
    </>
  )
}
