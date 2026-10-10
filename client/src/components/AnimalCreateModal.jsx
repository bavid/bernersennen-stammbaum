import Modal from './Modal.jsx'
import QuickAnimalForm from './QuickAnimalForm.jsx'
import { t } from '../lib/i18n/index.js'

// "Neues Tier anlegen" (Phase W: gemeinsam für Tiere, Familienbande und Gruppenseite statt je Seite kopiert): ein Formular -
// Tierart und Name, der Rest unter „Mehr Angaben“ (QuickAnimalForm). creator: hooks/useAnimalCreate.js; allDogs: alle
// sichtbaren Tiere (Eltern, Mitbewohner); ownFamilyId: der aktive Bereich.
export default function AnimalCreateModal({ creator, allDogs, ownFamilyId }) {
  const { form, close, announceCreated } = creator
  return (
    <Modal open={Boolean(form)} title={t('Neues Tier anlegen')} onClose={close}>
      {form && <QuickAnimalForm allDogs={allDogs} ownFamilyId={ownFamilyId} livesWith={form.livesWith} onCreated={announceCreated} onCancel={close} />}
    </Modal>
  )
}
