import { useEffect } from 'react'
import { clearDrafts } from '../lib/entryForm.js'

// Entwürfe neuer Erinnerungen (lib/entryForm.js) bleiben nicht über das Ende der Sitzung hinaus liegen - abgemeldet,
// abgelaufen (401) oder Admin-Ansicht beendet (App.jsx: signedOut = family === null). Als Effekt im Elternteil: er läuft
// nach dem Abbau der Seiten, deren offenes Formular beim Schließen seinen Entwurf noch einmal speichert.
export default function useClearDraftsOnSignOut(signedOut) {
  useEffect(() => {
    if (signedOut) clearDrafts()
  }, [signedOut])
}
