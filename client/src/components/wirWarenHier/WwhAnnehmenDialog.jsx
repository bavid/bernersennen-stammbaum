import Modal from '../Modal.jsx'
import { WWH } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'

// Nachfrage vor dem Annehmen eines Kontaktwunsches: nennt, was die andere Familie danach sieht. Dieselbe Erklärung im
// Reiter „Wir waren hier“ (WwhKontaktListe) und in der Hinweis-Glocke (components/hinweise/HinweisEintrag).
export default function WwhAnnehmenDialog({ open, disabled = false, onCancel, onConfirm }) {
  return (
    <Modal open={open} title={t(WWH.annehmenTitel)} onClose={onCancel}>
      <div className="wwh-dialog">
        <p>{t(WWH.annehmenErklaerung)}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t(WWH.abbrechen)}
          </button>
          <button type="button" className="btn btn-primary" disabled={disabled} onClick={onConfirm} data-autofocus>
            {t(WWH.jaAnnehmen)}
          </button>
        </div>
      </div>
    </Modal>
  )
}
