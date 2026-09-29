// Ein Abschnitt des Partner-Portals (/p/:slug): eigener Landmark-Abschnitt mit einheitlicher Überschrift
// (h2) und optionalem Kurztext - alle Abschnitte stehen auf derselben linken Kante mit demselben Abstand.
// Die Überschrift ist per Skript fokussierbar (tabIndex -1), damit "Kontakt" im Kopf dorthin springen kann.
export default function PortalSection({ id, title, lede, className, children }) {
  const headingId = `${id}-title`
  return (
    <section id={id} className={className ? `portal-section ${className}` : 'portal-section'} aria-labelledby={headingId}>
      <div className="portal-section-head">
        <h2 id={headingId} tabIndex={-1}>
          {title}
        </h2>
        {lede && <p className="portal-section-lede">{lede}</p>}
      </div>
      {children}
    </section>
  )
}
