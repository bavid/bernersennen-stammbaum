// Reine Hilfen für die Beiträge der Partner (/beitraege, PartnerPostsEditor) - spiegeln die Regeln von
// server/lib/partnerPosts.js (erlaubte Bereiche je Typ, höchstens 20, immer "Anzeige") und die Felder
// von server/lib/promotions.js validatePromotion.
import { promotionErrorField } from './adminMarketing.js'

export const MAX_POSTS = 20
export const MAX_TITEL_LENGTH = 120
export const MAX_TEXT_LENGTH = 600
export const MAX_URL_LENGTH = 300

export const POSTS_HINT =
  'Beiträge erscheinen nach Freigabe durch uns als ‚Anzeige‘ bei Menschen in eurer Nähe. Jede Änderung wird erneut geprüft.'
export const RESUBMIT_HINT = 'Nach dem Speichern prüfen wir den Beitrag erneut – bis zur Freigabe ist er nicht öffentlich.'
export const LIMIT_HINT = `Höchstens ${MAX_POSTS} Beiträge – bitte ältere löschen, um neue anzulegen.`
export const IMAGE_LATER_HINT = 'Ein Bild könnt ihr nach dem Speichern über „Bearbeiten“ hochladen.'
export const HTML_MESSAGE = 'Titel und Text dürfen nur reinen Text enthalten (kein HTML).'

// Erlaubte Bereiche je Partner-Typ - wie server/lib/partnerPosts.js BEREICHE_BY_TYP.
export const BEREICHE_BY_TYP = Object.freeze({
  hundeschule: ['hundeschule'],
  hundesalon: ['salon'],
  betreuung: ['salon'],
  tierheim: ['begleiter', 'unterstuetzen'],
  vermittlung: ['begleiter', 'unterstuetzen'],
  futter: ['futter'],
  sonstige: ['unterstuetzen', 'futter']
})

// Wo ein Beitrag in "Entdecken" erscheint - aus Sicht des Partners beschriftet.
export const POST_BEREICH_LABELS = {
  hundeschule: 'Hundeschule gesucht?',
  salon: 'Salon & Betreuung',
  begleiter: 'Neuer Begleiter gesucht?',
  unterstuetzen: 'Unterstützen',
  futter: 'Futter-Empfehlungen'
}

export function allowedBereiche(typ) {
  return BEREICHE_BY_TYP[typ] || []
}

// Freigabe durch den Admin (server/lib/promotions.js FREIGABE) - dieselben Wörter beim Partner und im Admin.
export const FREIGABE_LABELS = {
  eingereicht: 'Wartet auf Freigabe',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt'
}

// Unbekannte Werte gelten als "wartet" - lieber zu vorsichtig als fälschlich "Freigegeben".
export function freigabeKey(freigabe) {
  return Object.hasOwn(FREIGABE_LABELS, freigabe) ? freigabe : 'eingereicht'
}

export function clickCount(value) {
  return Number.isInteger(value) && value > 0 ? value : 0
}

// Formularwerte (Strings, dazu aktiv) aus einem eigenen Beitrag (camelCase, server ownPost) bzw. leer
// beim Neuanlegen - mit genau einem erlaubten Bereich ist er schon gewählt.
export function initialPostForm(post, typ) {
  const allowed = allowedBereiche(typ)
  return {
    titel: post?.titel || '',
    text: post?.text || '',
    bereich: post?.bereich || (allowed.length === 1 ? allowed[0] : ''),
    url: post?.url || '',
    start: post?.start || '',
    ende: post?.ende || '',
    aktiv: post ? Boolean(post.aktiv) : true
  }
}

// Immer der vollständige Beitrag - PUT prüft wie POST alles. Leere Felder gehen als null.
export function toPostPayload(form) {
  return {
    titel: form.titel.trim(),
    text: form.text.trim() || null,
    bereich: form.bereich,
    url: form.url.trim() || null,
    start: form.start || null,
    ende: form.ende || null,
    aktiv: form.aktiv
  }
}

const HTML_RE = /[<>]/

// Was der Server sicher ablehnen würde, gleich am Feld melden - gleicher Wortlaut wie dort.
export function postClientErrors(form, typ) {
  const errors = {}
  if (!form.titel.trim()) errors.titel = 'Der Titel ist Pflicht'
  else if (HTML_RE.test(form.titel)) errors.titel = HTML_MESSAGE
  if (HTML_RE.test(form.text)) errors.text = HTML_MESSAGE
  if (!allowedBereiche(typ).includes(form.bereich)) errors.bereich = 'Bitte einen Bereich wählen'
  if (form.start && form.ende && form.ende < form.start) errors.ende = 'Das Ende darf nicht vor dem Start liegen'
  return errors
}

// Server-Meldung -> Formularfeld: dieselben Meldungen wie beim Admin (validatePromotion), dazu die
// Bereich-Prüfung der Partner. Alles andere (Limit, Demo, HTML) steht oben im Formular.
export function postErrorField(message) {
  if (typeof message === 'string' && /^Dieser Bereich /.test(message)) return 'bereich'
  return promotionErrorField(message)
}
