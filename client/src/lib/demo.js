import { createContext, useContext } from 'react'

const DemoContext = createContext(false)

export const DemoProvider = DemoContext.Provider

// true, solange das eingeloggte Rudel schreibgeschützt ist (öffentliche Demo)
export const useIsDemo = () => useContext(DemoContext)
