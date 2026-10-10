import Modal from '../Modal.jsx'
import FotoImportPick from './FotoImportPick.jsx'
import FotoImportReview from './FotoImportReview.jsx'
import { FotoImportDone, FotoImportProgress } from './FotoImportRun.jsx'
import useFotoImport from './useFotoImport.js'
import { IMPORT_TEXT } from '../../lib/fotoImport/texts.js'
import { t } from '../../lib/i18n/index.js'
import '../../styles/foto-import.css'

// „Fotos mitbringen“ (Plan 2027): eigener Chunk (React.lazy in components/dog/DogChronicle.jsx) - fflate und der
// EXIF-Leser landen nicht im Haupt-Bundle. Alles Lesen, Gruppieren und Neu-Kodieren passiert im Browser.
export default function FotoImportDialog({ dogId, isHousehold, shareNames, onCreated, onClose, deps }) {
  const flow = useFotoImport({ dogId, onCreated, ...(deps ? { deps } : {}) })
  function close() {
    flow.cancel()
    onClose()
  }
  let body
  if (flow.step === 'pick' || flow.step === 'reading') body = <FotoImportPick reading={flow.step === 'reading'} error={flow.error} onFiles={flow.pick} />
  else if (flow.step === 'review') body = <FotoImportReview flow={flow} isHousehold={isHousehold} shareNames={shareNames} />
  else if (flow.step === 'run') body = <FotoImportProgress progress={flow.progress} onCancel={flow.cancel} />
  else body = <FotoImportDone result={flow.result} onRetry={flow.start} onClose={close} />
  return (
    <Modal open title={t(IMPORT_TEXT.title)} onClose={close} className="foto-import-modal">
      {body}
    </Modal>
  )
}
