import { useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import RequestVoucherForm from './RequestVoucherForm.jsx'
import RequestPartnerForm from './RequestPartnerForm.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'

// Band über jeder Seite einer Demo-Sitzung (App.jsx). Haushalte und Rudel: "Eigene Familie anlegen" (onLeave meldet
// ab und führt zum Einlösen) und daneben "Gutschein anfragen" - wer die Demo mag, aber noch keinen Gutschein hat,
// fragt direkt hier an (Phase N, RequestVoucherForm im Modal). Partner- und Tierheim-Demos (partnerArea): ein
// Gutschein für ein Zuhause hilft einem Partner nicht - dort "Partner-Zugang anfragen" (RequestPartnerForm).
// Anfragen nimmt der Server auch aus Demo-Sitzungen an; sie gehören keinem Bereich, sie gehen an den Admin.
export default function DemoBanner({ onLeave, partnerArea = false }) {
  const { words } = useTheme()
  const [requestOpen, setRequestOpen] = useState(false)
  const openRequest = () => setRequestOpen(true)

  return (
    <>
      <div className="demo-banner" role="status">
        <Icon name="alert" />
        <span>Du siehst eine schreibgeschützte Demo – nichts wird gespeichert oder hochgeladen.</span>
        {partnerArea ? (
          <button type="button" className="btn btn-primary" onClick={openRequest}>
            Partner-Zugang anfragen
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onLeave}>
              {words.createOwnGroup}
            </button>
            <button type="button" className="btn btn-ghost" onClick={openRequest}>
              Gutschein anfragen
            </button>
          </>
        )}
      </div>
      <Modal
        open={requestOpen}
        title={partnerArea ? 'Partner-Zugang anfragen' : 'Gutschein anfragen'}
        onClose={() => setRequestOpen(false)}
      >
        {partnerArea ? <RequestPartnerForm idPrefix="demo-request-partner" /> : <RequestVoucherForm idPrefix="demo-request-voucher" />}
      </Modal>
    </>
  )
}
