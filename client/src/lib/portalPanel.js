import { createContext, useContext } from 'react'

// Ist der Reiter des Portals, in dem eine Komponente steht, gerade sichtbar (PortalBody)? Alle Reiter bleiben im
// Dokument - ein offener Dialog darin (Einblick groß, "Schreib uns") schließt sich, sobald sein Reiter verborgen wird
// (z. B. per Zurück im Browser), statt in einem unsichtbaren Teil der Seite offen zu bleiben. Ohne Provider gilt true.
const PortalPanelContext = createContext(true)

export const PortalPanelProvider = PortalPanelContext.Provider

export const usePortalPanelActive = () => useContext(PortalPanelContext)
