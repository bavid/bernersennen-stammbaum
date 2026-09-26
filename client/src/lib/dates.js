const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function parts(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return { year, month, day }
}

export function todayIso() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function yearOf(iso) {
  return parts(iso)?.year ?? null
}

// "12. Mai 2014"
export function formatDateLong(iso) {
  const p = parts(iso)
  return p ? `${p.day}. ${MONTHS[p.month - 1]} ${p.year}` : ''
}

// "12.05.2014"
export function formatDateShort(iso) {
  const p = parts(iso)
  if (!p) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(p.day)}.${pad(p.month)}.${p.year}`
}

// "12. Mai"
export function formatDayMonth(iso) {
  const p = parts(iso)
  return p ? `${p.day}. ${MONTHS[p.month - 1]}` : ''
}

function monthsBetween(fromIso, toIso) {
  const a = parts(fromIso)
  const b = parts(toIso)
  if (!a || !b) return null
  let months = (b.year - a.year) * 12 + (b.month - a.month)
  if (b.day < a.day) months -= 1
  return months
}

// Alter als lesbarer Text, z.B. "3 Jahre", "7 Monate", "2 Wochen". null wenn vor der Geburt.
export function ageText(birthIso, atIso = todayIso()) {
  const months = monthsBetween(birthIso, atIso)
  if (months === null || months < 0) return null
  if (months >= 12) {
    const years = Math.floor(months / 12)
    return `${years} ${years === 1 ? 'Jahr' : 'Jahre'}`
  }
  if (months >= 1) return `${months} ${months === 1 ? 'Monat' : 'Monate'}`
  const days = Math.round((Date.parse(atIso) - Date.parse(birthIso)) / 86_400_000)
  if (days < 7) return days <= 0 ? null : `${days} ${days === 1 ? 'Tag' : 'Tage'}`
  const weeks = Math.floor(days / 7)
  return `${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`
}
