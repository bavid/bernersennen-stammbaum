// Das Wappen der Chronik: ein stilisierter Berner-Kopf im Medaillon.
export default function BernerMark({ size = 40, title, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title && <title>{title}</title>}
      <circle cx="32" cy="32" r="31" fill="#f1e2cc" />
      <circle cx="32" cy="32" r="31" fill="none" stroke="#b5541f" strokeWidth="2" />
      <path d="M18 19c-7 1-11 10-9 19 1 4 5 5 7 2l4-15Z" fill="#1c1511" />
      <path d="M46 19c7 1 11 10 9 19-1 4-5 5-7 2l-4-15Z" fill="#1c1511" />
      <path d="M32 11c11 0 17 9 17 20 0 13-8 22-17 22s-17-9-17-22c0-11 6-20 17-20Z" fill="#1c1511" />
      <ellipse cx="23.8" cy="41.5" rx="4" ry="4.4" fill="#b5541f" />
      <ellipse cx="40.2" cy="41.5" rx="4" ry="4.4" fill="#b5541f" />
      <circle cx="25.5" cy="23.2" r="2.1" fill="#b5541f" />
      <circle cx="38.5" cy="23.2" r="2.1" fill="#b5541f" />
      <path
        d="M32 14.5c-1.8 0-2.4 3.5-2.4 9l-.9 10.3c-4.3 1.8-6.3 6.3-5.5 10.4.9 4.8 4.6 8.3 8.8 8.3s7.9-3.5 8.8-8.3c.8-4.1-1.2-8.6-5.5-10.4l-.9-10.3c0-5.5-.6-9-2.4-9Z"
        fill="#fffaf2"
      />
      <ellipse cx="25.6" cy="28.6" rx="2.1" ry="2.3" fill="#4a2c18" />
      <ellipse cx="38.4" cy="28.6" rx="2.1" ry="2.3" fill="#4a2c18" />
      <circle cx="26.3" cy="27.9" r="0.7" fill="#fffaf2" />
      <circle cx="39.1" cy="27.9" r="0.7" fill="#fffaf2" />
      <path d="M28.6 42.3c0-1.9 6.8-1.9 6.8 0 0 2-2.5 3.6-3.4 3.6s-3.4-1.6-3.4-3.6Z" fill="#1c1511" />
      <path
        d="M32 45.9v2.4m-2.6.6c1 .9 2 .9 2.6-.6.6 1.5 1.6 1.5 2.6.6"
        fill="none"
        stroke="#1c1511"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}
