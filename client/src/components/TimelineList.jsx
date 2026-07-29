export default function TimelineList({ entries }) {
  if (!entries.length) {
    return <p className="empty-state">Noch keine Einträge in der Timeline.</p>
  }

  return (
    <div>
      {entries.map((entry) => (
        <div className="timeline-entry" key={entry.id}>
          <div className="timeline-date">{new Date(entry.datum).toLocaleDateString('de-DE')}</div>
          <div>
            <h3>{entry.titel}</h3>
            {entry.text && <p>{entry.text}</p>}
            <p className="dog-card-meta">von {entry.autor_name}</p>
            {entry.foto_urls?.length > 0 && (
              <div className="timeline-photos">
                {entry.foto_urls.map((url) => (
                  <img src={url} alt="" key={url} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
