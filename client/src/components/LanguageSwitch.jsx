import { LANGUAGES, setLang, useLang } from '../lib/i18n/index.js'
import '../styles/language-switch.css'

// Sprachwahl „Sprache / Language“: Deutsch | English. Die Beschriftung bleibt in beiden Sprachen zweisprachig, damit man
// den Schalter auch findet, wenn man die Sprache nicht liest. compact: kleine, unauffällige Zeile (Fuß der Startseite).
export default function LanguageSwitch({ compact = false, labelledBy }) {
  const lang = useLang()
  return (
    <div className={`segmented language-switch${compact ? ' is-compact' : ''}`} role="group" aria-label={labelledBy ? undefined : 'Sprache / Language'} aria-labelledby={labelledBy}>
      {LANGUAGES.map((option) => (
        <button
          key={option.code}
          type="button"
          lang={option.code}
          aria-pressed={lang === option.code}
          onClick={() => setLang(option.code)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
