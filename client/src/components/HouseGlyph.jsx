// Haus-Symbol für "lebt zusammen" – in der Legende, am Haupttier und über der Mitbewohner-Reihe
export const HOUSE_PATH = 'M-6,1 L0,-5 L6,1 M-4,-0.5 L-4,5 L4,5 L4,-0.5'

export default function HouseGlyph({ size = 20 }) {
  return (
    <svg className="house-glyph" viewBox="-10 -10 20 20" width={size} height={size} aria-hidden="true">
      <circle r="9.5" />
      <path d={HOUSE_PATH} />
    </svg>
  )
}
