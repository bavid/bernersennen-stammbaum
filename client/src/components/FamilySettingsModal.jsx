import { useTheme } from '../themes/ThemeProvider.jsx'
import Modal from './Modal.jsx'
import FamilySettings from './FamilySettings.jsx'
import { useToast } from './Toast.jsx'

// "Familie verwalten" als Dialog (Phase W: gemeinsam für Gruppenseite und OverviewPage): Name, Aussehen, Mitglieder,
// Verlassen. Nach dem Umbenennen bzw. neuen Aussehen zieht "me" mit (onFamilyChange) - ist der Bereich das eigene
// Zuhause, auch dessen Name in me.home.
export default function FamilySettingsModal({ open, family, onFamilyChange, onClose }) {
  const { words } = useTheme()
  const toast = useToast()

  function handleRenamed(renamed) {
    onClose()
    const merged = { ...family, ...renamed }
    if (family.home?.id === family.id) merged.home = { ...family.home, name: renamed.name }
    onFamilyChange(merged)
    toast(`${words.TheGroup} heißt jetzt „${renamed.name}“`)
  }

  function handleThemeSaved(updated) {
    onClose()
    onFamilyChange({ ...family, ...updated })
    toast('Neues Aussehen gespeichert')
  }

  return (
    <Modal open={open} title={words.groupSettings} onClose={onClose}>
      <FamilySettings family={family} onRenamed={handleRenamed} onChange={handleThemeSaved} onFamilyChange={onFamilyChange} onCancel={onClose} />
    </Modal>
  )
}
