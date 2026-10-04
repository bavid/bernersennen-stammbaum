import { formatClock } from '../../lib/bilderrahmen.js'

// Große Uhr mit Datum für den Rahmen im Regal - unten links, ruhig und gut lesbar.
export default function FrameClock({ now }) {
  const { time, date } = formatClock(now)
  return (
    <div className="frame-clock">
      <time className="frame-clock-time" dateTime={time}>
        {time}
      </time>
      <span className="frame-clock-date">{date}</span>
    </div>
  )
}
