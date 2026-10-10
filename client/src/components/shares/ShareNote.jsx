import { useTheme } from '../../themes/ThemeProvider.jsx'
import { t } from '../../lib/i18n/index.js'

// Der eine Satz zu Freigaben (Phase W, Schritt 2) - auf der Tierseite ("Wer sieht {Name}?") und in Einstellungen ›
// Familien gleich: wer was sieht, und dass Privates privat bleibt.
export default function ShareNote({ id }) {
  const { words } = useTheme()
  return (
    <p className="share-note" id={id}>
      {t('Ausgewählte {animals} und ihre nicht privaten {entries} sieht {wholeGroup}. Private {entries} bleiben immer bei euch.', {
        animals: words.animals,
        entries: words.entries,
        wholeGroup: words.wholeGroup
      })}
    </p>
  )
}
