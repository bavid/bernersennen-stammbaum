import InstallHint from '../InstallHint.jsx'

// Einstellungen › App: „Als App aufs Handy“ für Angemeldete - der Install-Hinweis in der Fassung, die stehen bleibt
// und „Schon als App installiert“ sagt, wenn die Chronik vom Startbildschirm aus läuft.
export default function AppSection() {
  return (
    <section className="settings-block app-section" aria-labelledby="app-title">
      <h2 id="app-title" className="visually-hidden">
        App
      </h2>
      <InstallHint variant="settings" headingLevel="h3" />
    </section>
  )
}
