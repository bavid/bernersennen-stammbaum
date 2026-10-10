import { useEffect } from 'react'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n/index.js'

export default function Lightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t('Foto')} onClick={onClose}>
      <img src={src} alt="" />
      <button type="button" className="icon-btn" aria-label={t('Schließen')} onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  )
}
