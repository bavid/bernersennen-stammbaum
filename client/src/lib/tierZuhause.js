// Wo ein Tier wohnt - die eine Stelle für die Herkunft auf Karten (Start, Suche, Neuigkeiten einer Familie) und im Kopf der
// Tierseite. Der Server nennt das Zuhause des Tiers nur, wenn es nicht das eigene ist (GET /api/start dog.zuhause, POST
// /api/suche zuhause, GET /api/timeline/recent dog_zuhause) - ein Tier des eigenen Zuhauses bekommt also keinen Hinweis.
// Gezeigt wird, wo das Tier lebt, nicht der Bereich, über den man es gerade sieht (der steckt nur noch im Link, ?in=).

// „aus Zuhause Möwenweg“ - dieselbe Wendung wie die Familienbande (DogCard „aus …“). Ohne Zuhause null.
export function originLabel(zuhause) {
  return zuhause ? `aus ${zuhause}` : null
}

// Der leise Zusatz dazu: über welche Familie man das Tier sieht - „geteilt in Familie Sonnenhang“. Nur für Familien und nur,
// wenn das nicht schon das Zuhause des Tiers ist (ein Tier, das der Familie selbst gehört).
export function sharedInHint(zuhause, area) {
  if (!zuhause || area?.art !== 'familie' || !area.name || area.name === zuhause) return null
  return `geteilt in ${area.name}`
}
