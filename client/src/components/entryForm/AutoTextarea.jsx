import { useLayoutEffect, useRef } from 'react'

// Textfeld, das mit dem Text mitwächst (bis zur Höhe, die das CSS erlaubt - danach scrollt es). Alle übrigen Props gehen
// an das <textarea>.
export default function AutoTextarea({ value, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return <textarea ref={ref} value={value} rows={3} {...props} />
}
