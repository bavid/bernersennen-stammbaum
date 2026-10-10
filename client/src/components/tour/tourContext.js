import { createContext, useContext } from 'react'

// Rundgang (TourProvider): { start({ scope, chapterKey }), chapters } - außerhalb des Providers null.
export const TourContext = createContext(null)

export function useTour() {
  return useContext(TourContext)
}

// true, solange die Frage nach dem Rundgang offen ist oder er läuft - andere Hinweise (PartnerDemoGuide) treten zurück.
export const TourBusyContext = createContext(false)

export function useTourBusy() {
  return useContext(TourBusyContext)
}
