import Modal from './Modal.jsx'
import DogForm from './DogForm.jsx'
import QuickAnimalForm from './QuickAnimalForm.jsx'

// "Neues Tier anlegen" (Phase W: gemeinsam für Tiere, Familienbande und Gruppenseite statt je Seite kopiert): erst das
// kurze Formular, nach "Mehr Angaben …" das volle. creator: hooks/useAnimalCreate.js; allDogs: alle sichtbaren Tiere
// (Eltern, Mitbewohner); ownFamilyId: der aktive Bereich (DogForm bietet nur dessen Tiere als Eltern an).
export default function AnimalCreateModal({ creator, allDogs, ownFamilyId }) {
  const { form, close, showMore, announceCreated, createFull } = creator
  return (
    <Modal open={Boolean(form)} title="Neues Tier anlegen" onClose={close}>
      {form &&
        (form.moreValues ? (
          <DogForm allDogs={allDogs} ownFamilyId={ownFamilyId} initialValues={form.moreValues} onSubmit={createFull} onCancel={close} />
        ) : (
          <QuickAnimalForm allDogs={allDogs} livesWith={form.livesWith} onCreated={announceCreated} onCancel={close} onMore={showMore} />
        ))}
    </Modal>
  )
}
