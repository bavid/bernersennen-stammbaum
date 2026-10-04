import { useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import RequestPartnerForm from './RequestPartnerForm.jsx'
import { TopStripSlot } from './TopStrip.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'

// Hinweis über jeder Seite einer Demo-Sitzung (App.jsx), seit der Calm-down-Runde eine schmale Zeile in der Leiste oben
// (TopStrip): „Demo · nur ansehen“ und EIN Text-Link. Haushalte und Rudel: "Eigene Familie anlegen" (onLeave meldet ab
// und führt zum Einlösen auf /v - dort steht auch "Noch keinen Gutschein? Gutschein anfragen", LoginVoucherRequest).
// Partner- und Tierheim-Demos (partnerArea): ein Gutschein für ein Zuhause hilft einem Partner nicht - dort
// "Partner-Zugang anfragen" (RequestPartnerForm im Modal; Anfragen nimmt der Server auch aus Demo-Sitzungen an).
export default function DemoBanner({ onLeave, partnerArea = false }) {
  const { words } = useTheme()
  const [requestOpen, setRequestOpen] = useState(false)

  return (
    <>
      <TopStripSlot>
        <div className="demo-banner" role="status">
          <Icon name="eye" />
          <span className="top-strip-text">
            <strong className="top-strip-tag">Demo</strong>
            <span className="top-strip-long"> · nur ansehen, nichts wird gespeichert</span>
          </span>
          {partnerArea ? (
            <button type="button" className="top-strip-link" onClick={() => setRequestOpen(true)}>
              Partner-Zugang anfragen
            </button>
          ) : (
            <button type="button" className="top-strip-link" onClick={onLeave}>
              {words.createOwnGroup}
            </button>
          )}
        </div>
      </TopStripSlot>
      {partnerArea && (
        <Modal open={requestOpen} title="Partner-Zugang anfragen" onClose={() => setRequestOpen(false)}>
          <RequestPartnerForm idPrefix="demo-request-partner" />
        </Modal>
      )}
    </>
  )
}
