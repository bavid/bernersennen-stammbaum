import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'

const ARM_TIMEOUT_MS = 3500

// Zweistufiger Löschen-Knopf: erst scharf schalten, dann bestätigen. describedBy (optional): id eines
// Hinweises, der z. B. erklärt, warum der Knopf gesperrt ist (aria-describedby).
export default function ConfirmButton({
  onConfirm,
  label = 'Löschen',
  confirmLabel = 'Wirklich löschen?',
  disabled,
  className = '',
  ariaLabel,
  describedBy
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [armed])

  function handleClick() {
    if (armed) {
      setArmed(false)
      onConfirm()
    } else {
      setArmed(true)
    }
  }

  return (
    <button
      type="button"
      className={`btn btn-danger ${className} ${armed ? 'is-armed' : ''}`}
      onClick={handleClick}
      disabled={disabled}
      aria-label={armed ? confirmLabel : ariaLabel || undefined}
      aria-describedby={describedBy}
    >
      <Icon name="trash" />
      {armed ? confirmLabel : label}
    </button>
  )
}
