import Modal from '../Modal.jsx'
import { WWH } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Nachfrage vor dem Annehmen eines Kontaktwunsches: nennt, was die andere Familie danach sieht. Dieselbe Erklärung im
// Reiter „Wir waren hier“ (WwhKontaktListe) und in der Hinweis-Glocke (components/hinweise/HinweisEintrag).
export default function WwhAnnehmenDialog({ open, disabled = false, onCancel, onConfirm }) {
  return (
    <Modal open={open} title={t(WWH.annehmenTitel)} onClose={onCancel}>
      <div className="wwh-dialog">
        <p>{t(WWH.annehmenErklaerung)}</p>
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t(WWH.abbrechen)}
          </Button>
          <Button type="button" disabled={disabled} onClick={onConfirm} data-autofocus>
            {t(WWH.jaAnnehmen)}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
