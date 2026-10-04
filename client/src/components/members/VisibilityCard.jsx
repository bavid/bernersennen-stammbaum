import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'

// „Wer sieht was?“ auf der Mitglieder-Seite: die drei Kreise Privat / Familie / Öffentlich, damit klar
// ist, dass eine Familie nie öffentlich ist und Mitglieder je nach Rolle unterschiedlich viel dürfen. collapsed (Phase W,
// Reiter "Mitglieder" der Gruppenseite): zum Aufklappen, die Überschrift bleibt sichtbar.
export default function VisibilityCard({ collapsed = false }) {
  const { words } = useTheme()
  const rows = [
    {
      icon: 'lock',
      title: 'Privat',
      who: 'nur euer Zuhause',
      text: `Private ${words.entries} und alles, was ihr nicht teilt, sehen nur die Menschen in eurem Zuhause.`
    },
    {
      icon: 'users',
      title: words.group,
      who: 'Mitglieder, je nach Rolle',
      text: `Geteilte Tiere und ihre ${words.entries} sehen alle Mitglieder ${words.ofGroup}. Was wer ändern darf, hängt an der Rolle.`
    },
    {
      icon: 'globe',
      title: 'Öffentlich',
      who: 'nur Partner-Portale, Steckbriefe und Happy Ends mit Einwilligung',
      text: `${words.groupNeverPublic} Öffentlich wird nur, was ihr auf einem Steckbrief oder bei einem Partner ausdrücklich freigebt.`
    }
  ]
  const list = (
    <ul className="visibility-rows">
      {rows.map((row) => (
        <li key={row.title} className="visibility-row">
          <span className="visibility-icon" aria-hidden="true">
            <Icon name={row.icon} />
          </span>
          <div>
            <strong>
              {row.title} <span className="visibility-who">· {row.who}</span>
            </strong>
            <p>{row.text}</p>
          </div>
        </li>
      ))}
    </ul>
  )
  if (collapsed) {
    return (
      <details className="card visibility-card is-collapsible">
        <summary>
          <h2 id="visibility-title">Wer sieht was?</h2>
        </summary>
        {list}
      </details>
    )
  }
  return (
    <section className="card visibility-card" aria-labelledby="visibility-title">
      <h2 id="visibility-title">Wer sieht was?</h2>
      {list}
    </section>
  )
}
