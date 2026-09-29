import { DEMO_PARTNER_SLUGS } from './demoPartners.js'

// Präsentationsmodus (Phase 5 Task 5, AdminPresentPage) und sein Einstieg /demo-start (DemoStartPage): reine
// Hilfen ohne DOM. Jede Kachel öffnet /demo-start?as=…&slug=…&ziel=… in einem neuen Tab; die Seite dort ruft
// POST /api/demo (server/routes/auth.js, as: tierheim | partner | rudel, ohne as das Demo-Zuhause) und wechselt
// zur Startroute des Bereichs - oder zum Ziel (ziel=kundensicht -> /kundensicht).

export const DEMO_START_PATH = '/demo-start'

// 'zuhause' ist nur ein Wert dieser Seite: der Server bekommt dann kein "as" (Vorgabe = Demo-Zuhause).
export const DEMO_AS = Object.freeze({ zuhause: 'zuhause', rudel: 'rudel', tierheim: 'tierheim', partner: 'partner' })
const DEMO_AS_VALUES = Object.values(DEMO_AS)

// Wohin es nach der Anmeldung geht, wenn nicht zur Startroute des Bereichs.
export const DEMO_ZIEL = Object.freeze({ kundensicht: '/kundensicht' })

// Wie server/lib/partners.js SLUG_RE - alles andere geht gar nicht erst zum Server.
const SLUG_RE = /^[a-z0-9-]{3,60}$/

export const PRESENT_TILES = Object.freeze([
  {
    key: 'zuhause',
    label: 'Als Familie ansehen',
    description: '„Meine Chronik“ eines Zuhauses – Wegbegleiter, Stammbaum, Pinnwand und Entdecken.',
    icon: 'home',
    as: DEMO_AS.zuhause
  },
  {
    key: 'rudel',
    label: 'Als Rudel ansehen',
    description: 'Mehrere Zuhause, ein gemeinsamer Stammbaum – mit Mitgliedern und Rollen.',
    icon: 'users',
    as: DEMO_AS.rudel
  },
  {
    key: 'tierheim',
    label: 'Als Tierheim ansehen',
    description: 'Tiere in Vermittlung, Steckbriefe, Übergabe-Gutscheine und Happy Ends.',
    icon: 'paw',
    as: DEMO_AS.tierheim
  },
  {
    key: 'hundeschule',
    label: 'Als Hundeschule ansehen',
    description: 'Partner-Profil mit Einblicken, Beiträgen, Postfach und Kunden-Gutscheinen.',
    icon: 'globe',
    as: DEMO_AS.partner,
    slug: DEMO_PARTNER_SLUGS.hundeschule
  },
  {
    key: 'hundesalon',
    label: 'Als Hundesalon ansehen',
    description: 'Dasselbe Profil aus Sicht eines Salons – mit eigener Farbe und eigenem Portal.',
    icon: 'heart',
    as: DEMO_AS.partner,
    slug: DEMO_PARTNER_SLUGS.hundesalon
  },
  {
    key: 'kundensicht',
    label: 'Kundensicht eines Partners',
    description: 'So sieht die Kundschaft die Hundeschule – in „Entdecken“ und auf ihrem Portal.',
    icon: 'eye',
    as: DEMO_AS.partner,
    slug: DEMO_PARTNER_SLUGS.hundeschule,
    ziel: 'kundensicht'
  }
])

// /demo-start?as=…&slug=…&ziel=… für eine Kachel.
export function demoStartUrl({ as, slug, ziel }) {
  const params = new URLSearchParams({ as })
  if (slug) params.set('slug', slug)
  if (ziel) params.set('ziel', ziel)
  return `${DEMO_START_PATH}?${params.toString()}`
}

// Liest die Adresse von /demo-start: { as, demoArgs (für api.demo), route (Ziel oder null) } - oder null, wenn
// as, slug oder ziel nicht zu den bekannten Werten gehören (dann keine Anfrage an den Server).
export function parseDemoStart(search) {
  const params = new URLSearchParams(search || '')
  const as = params.get('as') || DEMO_AS.zuhause
  if (!DEMO_AS_VALUES.includes(as)) return null
  const slug = params.get('slug')
  if (slug !== null && (as !== DEMO_AS.partner || !SLUG_RE.test(slug))) return null
  const ziel = params.get('ziel')
  if (ziel !== null && !DEMO_ZIEL[ziel]) return null
  const demoArgs = as === DEMO_AS.zuhause ? {} : { as, ...(slug ? { slug } : {}) }
  return { as, slug, demoArgs, route: ziel ? DEMO_ZIEL[ziel] : null }
}

// Portal eines Partners aus der Admin-Liste (Zeile mit slug/is_demo): mit dem Admin-Cookie zeigt der Server auch
// Entwürfe, pausierte und gesperrte Partner als Vorschau (server/routes/partners.js findPortalPartner). Demo-Partner
// sind außerhalb von dev/staging nur mit ?demo=1 sichtbar (demoAllowed) - der Admin ist keine Demo-Sitzung.
export function portalPreviewUrl(partner) {
  if (!partner?.slug) return null
  const path = `/p/${encodeURIComponent(partner.slug)}`
  return partner.is_demo ? `${path}?demo=1` : path
}
