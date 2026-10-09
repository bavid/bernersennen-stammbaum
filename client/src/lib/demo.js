import { createContext, createElement, useContext, useMemo } from 'react'
import { useTr } from './i18n/index.js'

// Schreibgeschützte Sitzungen - zwei Fälle, dieselbe Sperre:
// - die öffentliche Demo (me.isDemo): Ansehen ja, Speichern nie ("In der Demo nicht möglich.");
// - die Admin-Ansicht (me.adminView, Phase 5 Task 5b): der Admin öffnet einen fremden Bereich nur lesend
//   ("In der Admin-Ansicht nicht möglich."), der Server lehnt jede Schreib-Anfrage ohnehin ab.
// Komponenten fragen useIsDemo() (true in beiden Fällen) und zeigen den passenden Hinweis über useReadOnlyHint().
export const DEMO_HINT = 'In der Demo nicht möglich.'
export const ADMIN_VIEW_HINT = 'In der Admin-Ansicht nicht möglich.'

const NOT_READ_ONLY = Object.freeze({ isDemo: false, isAdminView: false })

const ReadOnlyContext = createContext(NOT_READ_ONLY)

// Schreibgeschützt? Für Stellen ohne Hook (App.jsx: Provider-Wert, Übernahme-Karte auf /v).
export function isReadOnly(family) {
  return Boolean(family?.isDemo || family?.adminView)
}

// Provider-Wert normalisieren: ein Boolean bedeutet weiterhin "Demo ja/nein" (bisheriger Aufruf, viele Tests),
// ein Objekt kommt aus der Sitzung (me) mit isDemo und adminView.
export function readOnlyModeOf(value) {
  if (typeof value === 'boolean') return value ? { isDemo: true, isAdminView: false } : NOT_READ_ONLY
  return { isDemo: Boolean(value?.isDemo), isAdminView: Boolean(value?.adminView ?? value?.isAdminView) }
}

export function DemoProvider({ value, children }) {
  const { isDemo, isAdminView } = readOnlyModeOf(value)
  const mode = useMemo(() => ({ isDemo, isAdminView }), [isDemo, isAdminView])
  return createElement(ReadOnlyContext.Provider, { value: mode }, children)
}

// true, solange die Sitzung schreibgeschützt ist - öffentliche Demo ODER Admin-Ansicht.
export function useIsDemo() {
  const { isDemo, isAdminView } = useContext(ReadOnlyContext)
  return isDemo || isAdminView
}

export function useIsAdminView() {
  return useContext(ReadOnlyContext).isAdminView
}

// Der Hinweis unter einem gesperrten Knopf: in der Admin-Ansicht immer ADMIN_VIEW_HINT, sonst der Demo-Text
// der Komponente (Standard DEMO_HINT - manche Stellen haben einen eigenen, z. B. "nur als Vorschau").
export function useReadOnlyHint(demoHint = DEMO_HINT) {
  const tr = useTr()
  if (useIsAdminView()) return tr('demo.adminHint', ADMIN_VIEW_HINT)
  return demoHint === DEMO_HINT ? tr('demo.hint', DEMO_HINT) : demoHint
}
