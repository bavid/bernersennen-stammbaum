import { useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n/index.js'

// Langer Text zeigt zuerst nur `lines` Zeilen, darunter "Mehr lesen" – kurzer Text bleibt, wie er ist
export default function ExpandableText({ text, className = '', lines = 4 }) {
  const ref = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    const check = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    check()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, expanded])

  const clamped = !expanded
  const classes = [className, clamped && 'is-clamped', clamped && overflowing && 'is-faded'].filter(Boolean).join(' ')

  return (
    <>
      <p ref={ref} className={classes} style={{ '--clamp-lines': lines }}>
        {text}
      </p>
      {(overflowing || expanded) && (
        <button type="button" className="expand-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? t('Weniger') : t('Mehr lesen')}
          <Icon name="chevronDown" className={expanded ? 'is-flipped' : ''} />
        </button>
      )}
    </>
  )
}
