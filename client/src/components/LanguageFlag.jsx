import '../styles/language-flag.css'

// Kleine runde Flagge einer Sprache (Kopf der App, Sprachwahl). Als SVG statt Emoji - Windows zeigt Flaggen-Emoji nur als
// Buchstaben. Rein schmückend (aria-hidden): den Namen der Sprache tragen Text oder aria-label daneben.
// Neue Sprache (lib/i18n/languages.js): hier eine Flagge dazu, sonst bleibt der Platz leer.
const FLAGS = {
  de: (
    <svg viewBox="0 0 30 30" focusable="false">
      <rect width="30" height="10" fill="#000" />
      <rect y="10" width="30" height="10" fill="#dd0000" />
      <rect y="20" width="30" height="10" fill="#ffce00" />
    </svg>
  ),
  en: (
    <svg viewBox="15 0 30 30" focusable="false">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#c8102e" strokeWidth="2" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  )
}

export default function LanguageFlag({ lang, size = 22 }) {
  const flag = FLAGS[lang]
  if (!flag) return null
  return (
    <span className="language-flag" data-lang={lang} aria-hidden="true" style={{ '--flag-size': `${size}px` }}>
      {flag}
    </span>
  )
}
