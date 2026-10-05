const jwt = require('jsonwebtoken')
const db = require('../db')
const { jwtSecret, cookieSecure, sessionCookie } = require('../config')
const { canEnter } = require('../lib/context')
const { isVisiting } = require('../lib/visits')
const { isGuestAllowed, GUEST_READ_ONLY } = require('../lib/guestAccess')
const { isAreaMismatch, sendAreaMismatch } = require('../lib/areaHeader')

const SESSION_DAYS = 30
// Phase 5 Task 5b: eine Admin-Ansicht (adminView) lebt nur so lange wie die Admin-Sitzung selbst
// (middleware/admin.js ADMIN_SESSION_HOURS), nicht 30 Tage - sie ersetzt das normale Sitzungs-Cookie des
// Admins im Browser und soll nicht länger als nötig ein fremdes Zuhause lesen können.
const ADMIN_VIEW_HOURS = 12

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: cookieSecure,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
}

const ADMIN_VIEW_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, maxAge: ADMIN_VIEW_HOURS * 60 * 60 * 1000 }

const familyById = db.prepare('SELECT is_demo, auth_epoch FROM families WHERE id = ?')
const userById = db.prepare('SELECT session_epoch FROM users WHERE id = ?')

const SESSION_EXPIRED = 'Sitzung abgelaufen – bitte neu anmelden'

// Prüft die Session, ohne Schreibzugriffe im Demo-Modus zu sperren (das übernimmt requireAuth).
// req.homeId ist die Identität (Zuhause oder klassisches Rudel-Login), req.familyId der aktive Bereich.
// req.isAdminView (Phase 5 Task 5b): die Sitzung hat der Admin über POST /api/admin/view/:familyId geöffnet -
// nur lesend (denyAdminViewWrites, global in app.js), Bereichswechsel über jede Mitgliedschaft der Identität.
// req.isGuest/req.guestOf (Phase V2): der aktive Bereich ist ein Zuhause, das die Identität besucht (lib/visits.js).
// Eine solche Besuchs-Sitzung darf NUR, was lib/guestAccess.js ausdrücklich erlaubt (ansehen, kommentieren, eigene
// Kommentare löschen, zurückwechseln) - jede andere Anfrage endet hier mit 403, bevor eine Route sie sieht.
// Phase W: X-Bereich (lib/areaHeader.js) - nennt der Client einen anderen als den aktiven Bereich, 409 {code:'BEREICH'}.
function requireSession(req, res, next) {
  const token = req.cookies?.[sessionCookie]
  if (!token) {
    return res.status(401).json({ error: 'Nicht eingeloggt' })
  }
  try {
    const payload = jwt.verify(token, jwtSecret)
    const family = familyById.get(payload.familyId)
    if (!family) {
      return res.status(401).json({ error: 'Rudel existiert nicht mehr' })
    }
    // Sitzungs-Epoche der Identität: alte Tokens ohne "e" gelten, solange auth_epoch noch 0 ist
    // (nie erneuert). Wird der Schlüssel erneuert, steigt auth_epoch und jedes ältere Token fällt raus.
    if ((payload.e ?? 0) !== family.auth_epoch) {
      return res.status(401).json({ error: SESSION_EXPIRED })
    }
    // Benutzer-Login (uid/ue): genauso, aber je Benutzer statt je Familie (z. B. nach Wiederherstellung).
    if (payload.uid) {
      const user = userById.get(payload.uid)
      if (!user || (payload.ue ?? 0) !== user.session_epoch) {
        return res.status(401).json({ error: SESSION_EXPIRED })
      }
    }
    const adminView = payload.adminView === true
    let active = payload.activeFamilyId ?? payload.familyId
    let isGuest = false
    if (active !== payload.familyId && !canEnter(payload.familyId, active, { adminView })) {
      // Zu Besuch (Phase V2) - oder Mitgliedschaft/Besuch beendet bzw. Familie gelöscht: zurück in den eigenen Bereich
      if (isVisiting(payload.familyId, active)) isGuest = true
      else active = payload.familyId
    }
    // Identität ODER aktiver Bereich demo -> als Demo behandeln (Verteidigungslinie neben canEnter,
    // das ein Auseinanderlaufen von Identität und Bereich im Normalbetrieb schon verhindert)
    const activeIsDemo = active === payload.familyId ? family.is_demo : familyById.get(active)?.is_demo
    req.homeId = payload.familyId
    req.familyId = active
    req.userId = payload.uid ?? null
    req.isDemo = Boolean(family.is_demo) || Boolean(activeIsDemo)
    req.isAdminView = adminView
    req.isGuest = isGuest
    req.guestOf = isGuest ? active : null
    // Phase W: zeigt der Client einen anderen Bereich als die Sitzung (zweiter Tab), lieber ablehnen als im falschen
    // Bereich lesen oder schreiben - vor der Besuchs-Sperre, damit ein veralteter Tab 409 (neu laden) statt 403 sieht.
    if (isAreaMismatch(req, active)) return sendAreaMismatch(res)
    if (isGuest && !isGuestAllowed(req)) return res.status(403).json({ error: GUEST_READ_ONLY })
    next()
  } catch {
    return res.status(401).json({ error: 'Session ungültig oder abgelaufen' })
  }
}

// Wie requireSession, aber ohne bei fehlendem/ungültigem Cookie mit 401 zu scheitern - für Stellen, die
// anonyme Anfragen weiterhin erlauben müssen, aber wissen wollen, ob eine gültige Sitzung zu einer
// Demo-Familie gehört (z. B. server/routes/partners.js demoAllowed, Finding 2: "Zum Portal" aus
// /umgebung heraus soll für eine angemeldete Demo-Familie nicht 404en, auch nicht in Produktion).
function sessionIsDemo(req) {
  const token = req.cookies?.[sessionCookie]
  if (!token) return false
  try {
    const payload = jwt.verify(token, jwtSecret)
    const family = familyById.get(payload.familyId)
    if (!family) return false
    if ((payload.e ?? 0) !== family.auth_epoch) return false
    if (payload.uid) {
      const user = userById.get(payload.uid)
      if (!user || (payload.ue ?? 0) !== user.session_epoch) return false
    }
    let active = payload.activeFamilyId ?? payload.familyId
    if (active !== payload.familyId && !canEnter(payload.familyId, active)) {
      active = payload.familyId
    }
    const activeIsDemo = active === payload.familyId ? family.is_demo : familyById.get(active)?.is_demo
    return Boolean(family.is_demo) || Boolean(activeIsDemo)
  } catch {
    return false
  }
}

// Middleware-Fassung von sessionIsDemo: setzt req.isDemo, antwortet aber nie selbst (next() immer) -
// anonyme oder ungültige Anfragen laufen mit req.isDemo=false einfach weiter.
function optionalSession(req, res, next) {
  req.isDemo = sessionIsDemo(req)
  next()
}

const DEMO_READ_ONLY = 'Demo-Modus: nur zum Ansehen, keine Änderungen möglich.'

// Schreibsperre für Demo-Sitzungen - läuft NACH requireSession (braucht req.isDemo). Eigene Middleware,
// damit Router, die lesende POSTs kennen (z. B. routes/partnerArea.js POST /preview/discover), die Sperre
// gezielt nur an ihre Schreib-Routen hängen können, statt requireAuth pauschal vorzuschalten.
function denyDemoWrites(req, res, next) {
  if (req.isDemo && req.method !== 'GET') return res.status(403).json({ error: DEMO_READ_ONLY })
  next()
}

// is_demo kommt aus der DB, nicht aus dem Token: so bleibt eine Demo-Familie schreibgeschützt,
// auch wenn jemand sich mit ihrem echten Passwort ganz normal einloggt.
function requireAuth(req, res, next) {
  requireSession(req, res, (err) => {
    if (err) return next(err)
    denyDemoWrites(req, res, next)
  })
}

const ADMIN_VIEW_READ_ONLY = 'Admin-Ansicht – nur lesen'

// Lesende POSTs, die eine Admin-Ansicht weiterhin braucht (Pfade relativ zu /api, klein geschrieben wie
// Express' Routing ohne "case sensitive routing"). Jeder andere POST/PUT/PATCH/DELETE ist ein Schreibzugriff:
// - /logout: die Ansicht beenden;
// - /view: zwischen Zuhause und seinen Familien wechseln (routes/auth.js, prüft canEnter mit adminView);
// - /discover, /partner-area/preview/discover: "Entdecken" und seine Kundensicht-Vorschau - POST nur, damit
//   die PLZ nicht in der URL steht (routes/discover.js, routes/partnerArea/preview.js);
// - /places/search, /public/partners/near: Umkreissuche "In der Nähe", PLZ/Koordinaten im Body (routes/places.js,
//   routes/partners.js);
// - /places/plz: nächste PLZ zum Standort (Einstellungen › App), Koordinaten im Body (routes/places.js);
// - /vouchers/check: reines Nachschauen eines Codes, nie in der URL (routes/vouchers.js);
// - /suche: die Suche, der Suchbegriff im Body statt in der URL (routes/suche.js).
// /api/admin/* läuft über das Admin-Cookie, nicht über die Sitzung - deshalb ebenfalls frei (sonst könnte der
// Admin mit offener Admin-Ansicht im selben Browser nichts mehr verwalten).
const ADMIN_VIEW_READ_ONLY_POSTS = new Set([
  '/logout',
  '/view',
  '/discover',
  '/partner-area/preview/discover',
  '/places/search',
  '/places/plz',
  '/public/partners/near',
  '/vouchers/check',
  '/suche'
])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Trägt das Sitzungs-Cookie dieser Anfrage die Markierung adminView? Nur die Signatur zählt - Epochen und
// Existenz der Familie prüft requireSession dahinter; ein abgelaufenes oder manipuliertes Token ist einfach
// keine Admin-Ansicht (und scheitert dann ganz normal an requireSession).
function isAdminViewRequest(req) {
  const token = req.cookies?.[sessionCookie]
  if (!token) return false
  try {
    return jwt.verify(token, jwtSecret).adminView === true
  } catch {
    return false
  }
}

function isAdminViewReadOnlyPath(req) {
  const urlPath = (req.path.replace(/\/+$/, '') || '/').toLowerCase()
  if (urlPath === '/admin' || urlPath.startsWith('/admin/')) return true
  return req.method === 'POST' && ADMIN_VIEW_READ_ONLY_POSTS.has(urlPath)
}

// Phase 5 Task 5b: Schreibsperre der Admin-Ansicht. Global unter /api eingehängt (app.js), VOR allen Routern -
// so wird auch ein Upload abgelehnt, bevor multer eine Datei auf die Platte schreibt, und ebenso jede
// öffentliche Schreib-Route (Kontaktformular, Gutschein einlösen, Login), solange die Ansicht offen ist.
function denyAdminViewWrites(req, res, next) {
  if (SAFE_METHODS.has(req.method) || isAdminViewReadOnlyPath(req) || !isAdminViewRequest(req)) return next()
  res.status(403).json({ error: ADMIN_VIEW_READ_ONLY })
}

// Liest die Epochen selbst, statt sie den Aufrufern zu überlassen: familyId ist die Identität (ihr
// auth_epoch landet in "e"), userId optional (dessen session_epoch dann in "ue" landet). adminView (Phase 5
// Task 5b) markiert eine Admin-Ansicht - kürzere Laufzeit, siehe ADMIN_VIEW_HOURS.
function signSession(familyId, activeFamilyId = familyId, { userId, adminView = false } = {}) {
  const family = familyById.get(familyId)
  const payload = { familyId, activeFamilyId, e: family?.auth_epoch ?? 0 }
  if (userId) {
    const user = userById.get(userId)
    payload.uid = userId
    payload.ue = user?.session_epoch ?? 0
  }
  if (adminView) payload.adminView = true
  return jwt.sign(payload, jwtSecret, { expiresIn: adminView ? `${ADMIN_VIEW_HOURS}h` : `${SESSION_DAYS}d` })
}

function setSessionCookie(res, familyId, activeFamilyId = familyId, opts = {}) {
  const options = opts.adminView ? ADMIN_VIEW_COOKIE_OPTIONS : COOKIE_OPTIONS
  res.cookie(sessionCookie, signSession(familyId, activeFamilyId, opts), options)
}

function clearSessionCookie(res) {
  const { maxAge, ...options } = COOKIE_OPTIONS
  res.clearCookie(sessionCookie, options)
}

// Signiert die Sitzung einer bereits authentifizierten Anfrage neu (Bereichswechsel, Schlüssel
// erneuern, Mitgliedschaft verlassen, ...) und behält dabei req.userId und req.isAdminView bei. Ohne das
// würde jede Neu-Signierung einen Benutzer-Login unbemerkt auf die reine Familien-Identität zurückfallen
// lassen (bzw. eine Admin-Ansicht zu einer vollen Sitzung machen) - beides kommt aus requireSession.
function refreshSession(req, res, activeId) {
  setSessionCookie(res, req.homeId, activeId, { userId: req.userId, adminView: Boolean(req.isAdminView) })
}

module.exports = {
  requireAuth,
  requireSession,
  denyDemoWrites,
  denyAdminViewWrites,
  ADMIN_VIEW_READ_ONLY,
  ADMIN_VIEW_READ_ONLY_POSTS,
  optionalSession,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  refreshSession
}
