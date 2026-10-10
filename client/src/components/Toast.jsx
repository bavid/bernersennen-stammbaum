import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n/index.js'

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
          {typeof toast.message === 'string' ? t(toast.message) : toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}
