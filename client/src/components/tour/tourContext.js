import { createContext, useContext } from 'react'

// Rundgang (TourProvider): { start({ scope, chapterKey }), chapters } - außerhalb des Providers null.
export const TourContext = createContext(null)

export function useTour() {
  return useContext(TourContext)
}
