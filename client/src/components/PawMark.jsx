// Logo von „Familie auf Pfoten": Pfote im Medaillon, der Ballen ist ein Herz
export default function PawMark({ size = 40, title, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      data-mark="paw"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title && <title>{title}</title>}
      <circle cx="32" cy="32" r="31" fill="#f1e2cc" />
      <circle cx="32" cy="32" r="31" fill="none" stroke="#b5541f" strokeWidth="2" />
      <ellipse cx="16" cy="29.5" rx="4" ry="5" transform="rotate(-26 16 29.5)" fill="#1c1511" />
      <ellipse cx="24.5" cy="18.5" rx="4.3" ry="5.4" transform="rotate(-9 24.5 18.5)" fill="#1c1511" />
      <ellipse cx="39.5" cy="18.5" rx="4.3" ry="5.4" transform="rotate(9 39.5 18.5)" fill="#1c1511" />
      <ellipse cx="48" cy="29.5" rx="4" ry="5" transform="rotate(26 48 29.5)" fill="#1c1511" />
      <path
        d="M32 53c-1.1 0-2.4-.7-3.7-1.9C23 46.7 18.8 43 18.8 38.2c0-3.8 2.9-6.8 6.4-6.8 2.7 0 4.9 1.5 6.8 3.9 1.9-2.4 4.1-3.9 6.8-3.9 3.5 0 6.4 3 6.4 6.8 0 4.8-4.2 8.5-9.5 12.9-1.3 1.2-2.6 1.9-3.7 1.9Z"
        fill="#b5541f"
      />
    </svg>
  )
}
