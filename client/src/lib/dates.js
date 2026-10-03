export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

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

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// "Sa, 18. Oktober 2026 · 14:00 Uhr" – mit short ohne Jahr: "Sa, 18. Oktober · 14:00 Uhr"
export function formatTermin(dateIso, time, { short = false } = {}) {
  const p = parts(dateIso)
  if (!p) return ''
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()]
  const day = short ? formatDayMonth(dateIso) : formatDateLong(dateIso)
  return `${weekday}, ${day}${time ? ` · ${time} Uhr` : ''}`
}

// SQLite-Zeitstempel ("2026-09-26 11:22:33", UTC) als "gerade eben", "heute", "gestern", "vor 3 Tagen", "12. Mai 2026"
export function relativeTime(sqliteTimestamp, now = new Date()) {
  const then = new Date(`${sqliteTimestamp.replace(' ', 'T')}Z`)
  if (Number.isNaN(then.getTime())) return ''
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 2) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Minuten`
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days} Tagen`
  const pad = (n) => String(n).padStart(2, '0')
  return formatDateLong(`${then.getFullYear()}-${pad(then.getMonth() + 1)}-${pad(then.getDate())}`)
}
