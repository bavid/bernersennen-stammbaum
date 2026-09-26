import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Icon from './Icon.jsx'

const TOAST_MS = 3200
const ToastContext = createContext(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const show = useCallback((message) => setToast({ message, key: Date.now() }), [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.key}>
          <Icon name="check" />
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}
