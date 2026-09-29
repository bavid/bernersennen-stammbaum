import { useTheme } from '../themes/ThemeProvider.jsx'
import { roleLabel } from '../lib/roles.js'

// Auswahl einer Rolle (Mitglieder-Seite, Einladungen): options ist die Liste der erlaubten Rollen -
// lib/roles.js inviteRoleOptions bzw. alle ROLES für die Leitung. Der aktuelle Wert bleibt wählbar,
// auch wenn er nicht in options steht (z. B. eine Einladung mit einer höheren Rolle), damit die
// Auswahl nie leer aussieht.
export default function RoleSelect({ id, value, options, onChange, disabled, ariaLabel, describedBy }) {
  const { words } = useTheme()
  const values = options.includes(value) || !value ? options : [value, ...options]
  return (
    <select
      id={id}
      className="role-select"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
    >
      {values.map((rolle) => (
        <option key={rolle} value={rolle}>
          {roleLabel(words, rolle)}
        </option>
      ))}
    </select>
  )
}
