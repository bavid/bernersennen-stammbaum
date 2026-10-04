// Phase W (Ruhige Hülle): alte Adressen der Zeit vor Start · Tiere · Familien · Entdecken führen an den neuen Ort
// (components/LegacyRedirect.jsx). Query und Hash bleiben erhalten (z. B. ?ansicht=stammbaum, ?gruppe=…, #entry-3), nur
// der Reiter des neuen Orts kommt dazu bzw. ersetzt einen alten. Die Tabelle steht in legacyRoutes.test.js.
import { FAMILIES_ROUTE, areaContext } from './areas.js'

const ANIMALS_ROUTE = '/tiere'
const ANIMALS_VIEW_PARAM = 'ansicht'
const GROUP_TAB_PARAM = 'reiter'

// params zuerst, danach alles aus der alten Adresse, was nicht schon gesetzt ist - "?reiter=tiere&ansicht=stammbaum".
function withParams(pathname, search, params, hash = '') {
  const merged = new URLSearchParams(params)
  for (const [key, value] of new URLSearchParams(search)) if (!merged.has(key)) merged.append(key, value)
  const query = merged.toString()
  return `${pathname}${query ? `?${query}` : ''}${hash}`
}

const inGroupPage = (context) => context === 'group' || context === 'visit'

// Ziel je alter Adresse und Kontext (lib/areas.js areaContext); null: hier gibt es nichts umzuleiten (die alte Seite
// gilt in diesem Kontext weiter, z. B. die Pinnwand des eigenen Zuhauses oder Mitglieder beim klassischen Login).
const TARGETS = {
  // Wegbegleiter -> Reiter "Zeitleiste" (gehört dem eigenen Zuhause; zu Besuch die des besuchten Zuhauses).
  wegbegleiter: (family, context, search, hash) =>
    context === 'visit'
      ? withParams(`${FAMILIES_ROUTE}/${family.id}`, search, { [GROUP_TAB_PARAM]: 'zeitleiste' }, hash)
      : withParams(ANIMALS_ROUTE, search, { [ANIMALS_VIEW_PARAM]: 'zeitleiste' }, hash),
  // Stammbaum/Familienbande -> Tiere (Zuhause, klassisch) bzw. Reiter "Tiere" der Gruppenseite; ?ansicht/?gruppe bleiben.
  tree: (family, context, search, hash) =>
    inGroupPage(context)
      ? withParams(`${FAMILIES_ROUTE}/${family.id}`, search, { [GROUP_TAB_PARAM]: 'tiere' }, hash)
      : withParams(ANIMALS_ROUTE, search, {}, hash),
  // Pinnwand einer Familie -> deren Reiter; die Pinnwand des Zuhauses und des klassischen Logins bleibt eine Seite.
  pinnwand: (family, context, search, hash) =>
    context === 'group' ? withParams(`${FAMILIES_ROUTE}/${family.id}`, search, { [GROUP_TAB_PARAM]: 'pinnwand' }, hash) : null,
  // Mitglieder & Rollen -> Reiter der Gruppenseite; im eigenen Zuhause (keine Familie aktiv) zur Familien-Liste.
  mitglieder: (family, context, search, hash) => {
    if (context === 'group') return withParams(`${FAMILIES_ROUTE}/${family.id}`, search, { [GROUP_TAB_PARAM]: 'mitglieder' }, hash)
    return context === 'home' ? FAMILIES_ROUTE : null
  }
}

export function legacyTarget(kind, family, { search = '', hash = '' } = {}) {
  const target = Object.hasOwn(TARGETS, kind) ? TARGETS[kind] : null
  return target ? target(family, areaContext(family), search, hash) : null
}
