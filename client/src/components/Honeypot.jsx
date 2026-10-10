import { t } from '../lib/i18n/index.js'
// Unsichtbar für Menschen (auch für Screenreader), Bots füllen es trotzdem aus. Bewusst nach dem
// Passwortfeld platziert: Passwort-Manager halten sonst ein Textfeld vor dem Passwort für den
// Benutzernamen und füllen es aus. Die data-Attribute bitten LastPass, 1Password, Bitwarden & Co.,
// das Feld zu ignorieren. id: eigene id, wenn auf derselben Seite schon ein Honigtopf steht (Portal:
// Gutschein einlösen und "Schreib uns" im Modal).
export default function Honeypot({ value, onChange, id = 'hp-feld' }) {
  return (
    <div className="honeypot" aria-hidden="true">
      <label htmlFor={id}>{t('Bitte leer lassen')}</label>
      <input
        id={id}
        name="hp_feld"
        tabIndex={-1}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
