import Icon from './Icon.jsx'
import { PARTNER_MARK_LABEL, isOfficialPartner } from '../lib/partnerTypes.js'

// Das eine, ruhige Merkmal öffentlicher Partnerkarten (Phase U, PartnerCard und PlaceList): offizielle Partner
// bekommen ein kleines Pfoten-Zeichen "Partner", alle anderen gar keins.
export default function PartnerMark({ badge }) {
  if (!isOfficialPartner(badge)) return null
  return (
    <span className="partner-mark">
      <Icon name="paw" />
      {PARTNER_MARK_LABEL}
    </span>
  )
}
