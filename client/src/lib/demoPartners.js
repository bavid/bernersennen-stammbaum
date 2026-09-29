// Die Demo-Partner mit eigenem Partner-Bereich (server/seed/demo-partner-area.js PARTNER_AREA_SLUGS): Ziel von
// POST /api/demo { as: 'partner', slug } - für die Demo-Knöpfe auf /partner-werden (PartnerInfoPage) und die
// Kacheln des Präsentationsmodus (AdminPresentPage). Ändert sich der Seed, dann auch hier.
export const DEMO_PARTNER_SLUGS = Object.freeze({
  hundeschule: 'hundeschule-pfotenglueck',
  hundesalon: 'hundesalon-wuschelglueck'
})
