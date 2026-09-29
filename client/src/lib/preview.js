import { createContext, useContext } from 'react'

// Kundensicht (Phase P1, /kundensicht): DiscoverPage, PartnerPortalPage und SteckbriefPage zeigen dort
// Vorschau-Daten eines Partners in einem Beispiel-Kunden-Rahmen. Die Seiten setzen diesen Kontext mit
// ihrem preview-Prop - alles darunter (Karten, Links, Bilder) fragt ihn über useIsPreview() ab, statt
// preview durch jede Ebene zu reichen. Ohne Provider gilt false: alles verhält sich wie bisher.

const PreviewContext = createContext(false)

export const PreviewProvider = PreviewContext.Provider

export const useIsPreview = () => useContext(PreviewContext)

// Tooltip und Beschreibung jedes Links, der in der Vorschau nirgendwohin führt (siehe PreviewLink.jsx).
export const PREVIEW_DISABLED_HINT = 'In der Vorschau deaktiviert'
