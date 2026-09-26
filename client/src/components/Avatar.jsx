import { shortName } from '../lib/timeline.js'

export default function Avatar({ dog, size = 56, className = '' }) {
  const style = { width: size, height: size, fontSize: size * 0.4 }
  return (
    <div className={`avatar ${className}`} style={style}>
      {dog.foto_url ? (
        <img src={dog.foto_url} alt="" loading="lazy" />
      ) : (
        <div className="avatar-fallback">
          <span>{shortName(dog.name).slice(0, 1).toUpperCase()}</span>
        </div>
      )}
    </div>
  )
}
