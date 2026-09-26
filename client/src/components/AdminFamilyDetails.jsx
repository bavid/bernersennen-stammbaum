import { useEffect, useState } from 'react'
import { api } from '../api'
import Avatar from './Avatar.jsx'
import { dogLabel, sexLabel } from '../lib/timeline.js'
import { formatDateShort, formatTermin, relativeTime } from '../lib/dates.js'

function parentLabel(name, unknown, rasse, freitext) {
  if (name) return dogLabel({ name, name_unbekannt: unknown, rasse })
  return freitext || '–'
}

function DogsTable({ dogs }) {
  if (!dogs.length) return <p className="muted">Keine Hunde.</p>
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Hund</th>
            <th>Rasse</th>
            <th>Geschlecht</th>
            <th>Geboren</th>
            <th>Mutter</th>
            <th>Vater</th>
            <th>Einträge</th>
          </tr>
        </thead>
        <tbody>
          {dogs.map((dog) => (
            <tr key={dog.id}>
              <td>
                <span className="admin-dog">
                  <Avatar dog={dog} size={28} />
                  {dogLabel(dog)}
                </span>
              </td>
              <td>{dog.rasse || '–'}</td>
              <td>{sexLabel(dog.geschlecht, dog.tierart)}</td>
              <td>{dog.geburtsdatum ? formatDateShort(dog.geburtsdatum) : '–'}</td>
              <td>{parentLabel(dog.mother_name, dog.mother_unbekannt, dog.mother_rasse, dog.mother_freitext)}</td>
              <td>{parentLabel(dog.father_name, dog.father_unbekannt, dog.father_rasse, dog.father_freitext)}</td>
              <td>{dog.entries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Alles zu einem Rudel: Hunde, neueste Einträge, Pinnwand samt Antworten (nur lesend)
export default function AdminFamilyDetails({ familyId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.admin
      .family(familyId)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [familyId])

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <p className="muted">Lade …</p>

  return (
    <div className="admin-details">
      <section>
        <h4>Hunde ({data.dogs.length})</h4>
        <DogsTable dogs={data.dogs} />
      </section>

      <section>
        <h4>Neueste Einträge ({data.entries.length})</h4>
        {data.entries.length === 0 && <p className="muted">Keine Einträge.</p>}
        <ul className="admin-list">
          {data.entries.map((entry) => (
            <li key={entry.id}>
              <strong>{dogLabel({ name: entry.dog_name, name_unbekannt: entry.dog_unbekannt, rasse: entry.dog_rasse })}</strong>
              {' · '}
              {formatDateShort(entry.datum)} – {entry.titel}
              {entry.foto_urls.length > 0 && (
                <span className="pill">
                  {entry.foto_urls.length} {entry.foto_urls.length === 1 ? 'Foto' : 'Fotos'}
                </span>
              )}
              <span className="muted">
                {' '}
                · {entry.autor_name}, {relativeTime(entry.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Pinnwand ({data.notes.length})</h4>
        {data.notes.length === 0 && <p className="muted">Keine Zettel.</p>}
        <ul className="admin-list">
          {data.notes.map((note) => (
            <li key={note.id}>
              {note.termin_datum && <span className="pill pill-rust">{formatTermin(note.termin_datum, note.termin_zeit)}</span>}{' '}
              {note.text}
              <span className="muted">
                {' '}
                · {note.autor_name}, {relativeTime(note.created_at)}
              </span>
              {note.replies.length > 0 && (
                <ul className="admin-replies">
                  {note.replies.map((reply) => (
                    <li key={reply.id}>
                      <strong>{reply.autor_name}:</strong> {reply.text}
                      <span className="muted"> · {relativeTime(reply.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
