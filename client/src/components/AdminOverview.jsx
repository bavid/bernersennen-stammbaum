import Icon from './Icon.jsx'
import AdminStats from './AdminStats.jsx'

const BYTES_PER_MB = 1024 * 1024

// Was im Admin auf eine Entscheidung wartet - jede Zeile öffnet ihren Reiter.
const TODO_ITEMS = [
  { tab: 'anfragen', key: 'openRequests', icon: 'mail', one: 'offene Anfrage', many: 'offene Anfragen' },
  { tab: 'freigaben', key: 'pendingPosts', icon: 'megaphone', one: 'Beitrag wartet auf Freigabe', many: 'Beiträge warten auf Freigabe' },
  { tab: 'nachrichten', key: 'openMessages', icon: 'message', one: 'offene Nachricht', many: 'offene Nachrichten' }
]

function isKnown(value) {
  return value !== undefined && value !== null
}

// "Zu tun": offene Anfragen, Beiträge zur Freigabe und offene Nachrichten. Ein Zähler ist null, solange er noch
// lädt; erst wenn alle bekannt und null sind, heißt es "nichts offen".
function AdminTodo({ todo, onOpenTab }) {
  const open = TODO_ITEMS.filter((item) => todo[item.key] > 0)
  const allKnown = TODO_ITEMS.every((item) => isKnown(todo[item.key]))

  return (
    <section className="admin-todo card" aria-labelledby="admin-todo-title">
      <h2 id="admin-todo-title">Zu tun</h2>
      {open.length > 0 && (
        <ul className="admin-todo-list">
          {open.map((item) => {
            const count = todo[item.key]
            return (
              <li key={item.tab}>
                <button type="button" className="admin-todo-item" onClick={() => onOpenTab(item.tab)}>
                  <Icon name={item.icon} />
                  <span className="admin-todo-text">
                    <strong>{count}</strong> {count === 1 ? item.one : item.many}
                  </span>
                  <Icon name="arrowRight" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open.length === 0 && <p className="muted">{allKnown ? 'Nichts offen – alles ist bearbeitet.' : 'Lade …'}</p>}
    </section>
  )
}

function StatsGrid({ stats }) {
  const items = [
    ['Offene Nachrichten', stats.openMessages],
    ['Rudel', stats.families],
    ['Hunde', stats.dogs],
    ['Einträge', stats.entries],
    ['Zettel', stats.notes],
    ['Antworten', stats.replies],
    ['Würfe', stats.breeding],
    ['Fotos', stats.uploads.files, `${(stats.uploads.bytes / BYTES_PER_MB).toFixed(1).replace('.', ',')} MB`]
  ]
  return (
    <section className="admin-inventory card" aria-labelledby="admin-inventory-title">
      <h2 id="admin-inventory-title">Bestand</h2>
      <dl className="admin-stats">
        {items.map(([label, value, hint]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {value}
              {hint && <small>{hint}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// Reiter "Übersicht" im Admin (Phase U): oben "Zu tun" mit Sprung in den passenden Reiter, darunter die
// Kennzahlen (AdminStats) und der Bestand der ganzen Instanz (overview.stats).
export default function AdminOverview({ stats, todo, onOpenTab }) {
  return (
    <div className="admin-panel-stack">
      <AdminTodo todo={todo} onOpenTab={onOpenTab} />
      <AdminStats bereiche={stats.families} />
      <StatsGrid stats={stats} />
    </div>
  )
}
