import { useTheme } from '../../themes/ThemeProvider.jsx'

// Der eine Satz zu Freigaben (Phase W, Schritt 2) - auf der Tierseite ("Wer sieht {Name}?") und in Einstellungen ›
// Familien gleich: wer was sieht, und dass Privates privat bleibt.
export default function ShareNote({ id }) {
  const { words } = useTheme()
  return (
    <p className="share-note" id={id}>
      Ausgewählte {words.animals} und ihre nicht privaten {words.entries} sieht {words.wholeGroup}. Private {words.entries}{' '}
      bleiben immer bei euch.
    </p>
  )
}
