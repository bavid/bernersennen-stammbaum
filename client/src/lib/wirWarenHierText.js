import { t } from './i18n/index.js'

// „Wir waren hier“ (docs/superpowers/plans/2026-10-10-wir-waren-hier.md, Aufgabe 6): alle Texte an einer Stelle. Die
// Werte sind die deutschen Texte (Schlüssel für t(), englisch in lib/i18n/en/wwh.js) - übersetzt wird erst beim Anzeigen,
// nie hier beim Laden des Moduls. Wörter für „Susi“: anmelden, hier zeigen, Erinnerung, Grüße - keine Fachwörter.
export const WWH = Object.freeze({
  titel: 'Wir waren hier',
  lede: 'Zeigt, dass ihr mit eurem Tier hier wart. {ort} gibt jede Anmeldung frei.',
  tierWaehlen: 'Welches Tier war dabei?',
  anmelden: 'Hier anmelden',
  alleAngemeldet: 'Alle eure Tiere sind hier schon angemeldet.',
  keineTiere: 'Legt zuerst ein Tier in „Mein Zuhause“ an.',
  angemeldet: 'Angemeldet – {ort} gibt die Anmeldung frei.',
  wartet: 'Wartet auf Freigabe durch {ort}',
  freigegeben: 'Von {ort} freigegeben',
  abgelehnt: '{ort} hat die Anmeldung nicht freigegeben.',
  hierZeigen: 'Hier zeigen',
  zeigenHinweis:
    'Andere Familien, die auch hier waren, sehen dann nur Name und Foto deines Tieres und die Erinnerungen, die ihr hier anheftet – nur hier. Ihr könnt das jederzeit ausschalten.',
  gezeigt: '{name} wird hier gezeigt.',
  nichtGezeigt: '{name} wird hier nicht mehr gezeigt.',
  abmelden: 'Abmelden',
  abmeldenFrage: 'Wirklich abmelden?',
  abmeldenLabel: '{name} hier abmelden',
  abgemeldet: '{name} ist hier abgemeldet.',
  erinnerungen: 'Erinnerungen von hier',
  erinnerungAnheften: 'Erinnerung anheften',
  erinnerungWaehlen: 'Welche Erinnerung gehört hierher?',
  anheften: 'Anheften',
  loesen: 'Lösen',
  loesenLabel: '„{titel}“ lösen',
  keineErinnerungen: 'Noch keine Erinnerung angeheftet.',
  keinePassende: 'Keine passende Erinnerung. Private Erinnerungen bleiben privat.',
  erstNachFreigabe: 'Erinnerungen könnt ihr anheften, sobald {ort} euch freigegeben hat.',
  erinnerungWartet: 'wartet auf Freigabe',
  angeheftet: '„{titel}“ ist angeheftet – {ort} gibt sie frei.',
  geloest: '„{titel}“ ist gelöst.',
  werNoch: 'Wer noch hier war',
  erstFreigabe: 'Sobald der Ort euch freigegeben hat, seht ihr hier, wer noch da war.',
  niemand: 'Noch zeigt sich hier niemand sonst.',
  kontaktAnfragen: 'Kontakt anfragen',
  kontaktAnfragenLabel: 'Kontakt zu {name} anfragen',
  angefragt: 'Angefragt',
  kontaktTitel: 'Kontakt zu {name}',
  kontaktErklaerung:
    'Die Familie von {name} bekommt euren Wunsch – mit Name und Foto eures Tieres, ohne euren Namen. Sagt sie zu, seht ihr die nicht privaten Erinnerungen ihrer Tiere.',
  mitWelchemTier: 'Mit welchem Tier?',
  anfrageSenden: 'Anfrage senden',
  abbrechen: 'Abbrechen',
  anfrageGesendet: 'Anfrage an {name} gesendet.',
  wuensche: 'Kontaktwünsche',
  wunschAn: '{tier} möchte {eigenes} kennenlernen.',
  // In der Hinweis-Glocke (lib/glocke.js) - dort mit Ort, weil die Wünsche aller Orte zusammenstehen.
  wunschAnOrt: '{tier} möchte {eigenes} kennenlernen – bei {ort}',
  wunschVon: 'Ihr habt {tier} gefragt – die Antwort steht noch aus.',
  annehmen: 'Annehmen',
  ablehnen: 'Ablehnen',
  zurueckziehen: 'Zurückziehen',
  zurueckziehenFrage: 'Wirklich zurückziehen?',
  annehmenTitel: 'Kontaktwunsch annehmen',
  annehmenErklaerung:
    'Dann sieht diese Familie die nicht privaten Erinnerungen eurer Tiere. Sie kann sie nur lesen und Grüße schreiben. Den Besuch könnt ihr jederzeit beenden.',
  jaAnnehmen: 'Ja, annehmen',
  angenommen: 'Angenommen – die Familie ist jetzt bei euch zu Besuch.',
  wunschAbgelehnt: 'Kontaktwunsch abgelehnt.',
  wunschZurueck: 'Kontaktwunsch zurückgezogen.',
  ortFehlt: 'An diesem Ort könnt ihr euch gerade nicht anmelden.',
  laden: 'Lädt …',
  zuViele: 'Gerade zu viele Versuche – bitte später noch einmal.',
  nichtErlaubt: 'Das geht hier gerade nicht.',
  // Block im Reiter „Infos“ des Tiers.
  orte: 'Orte, an denen wir waren',
  orteLeer: 'Noch an keinem Ort angemeldet. Auf der Seite einer Hundeschule oder eines Salons findet ihr „Wir waren hier“.',
  partnerAnsehen: 'Partner ansehen',
  hierGezeigt: 'hier gezeigt',
  einWunsch: '{n} Kontaktwunsch wartet',
  mehrWuensche: '{n} Kontaktwünsche warten',
  orteFehler: 'Die Orte konnten gerade nicht geladen werden.',
  // Posteingang des Partners.
  partnerLede: 'Familien melden sich mit ihrem Tier bei euch an und heften Erinnerungen an. Andere sehen erst etwas, wenn ihr es freigebt – und nur bei euch.',
  anmeldungen: 'Anmeldungen',
  angehefteteErinnerungen: 'Angeheftete Erinnerungen',
  keineAnmeldungen: 'Noch keine Anmeldungen.',
  keineAngehefteten: 'Noch keine angehefteten Erinnerungen.',
  freigeben: 'Freigeben',
  freigebenLabel: '{name} freigeben',
  ablehnenLabel: '{name} ablehnen',
  entfernen: 'Entfernen',
  entfernenFrage: 'Wirklich entfernen?',
  entfernenLabel: '{name} entfernen',
  ausblenden: 'Ausblenden',
  ausblendenLabel: '„{titel}“ ausblenden',
  wartetAufEuch: 'wartet auf euch',
  istFreigegeben: 'freigegeben',
  vonTier: 'von {name}',
  tierFreigegeben: '{name} ist freigegeben.',
  tierAbgelehnt: '{name} ist abgelehnt.',
  tierEntfernt: '{name} ist entfernt.',
  erinnerungFreigegeben: '„{titel}“ ist freigegeben.',
  erinnerungAusgeblendet: '„{titel}“ ist ausgeblendet.',
  offenZaehler: '{n} offen'
})

const GENERIC_ERROR = /^(Fehler|Error) \d+$/

// Verständliche Meldung zu einem Fehler der API: die (übersetzte) Meldung des Servers, nur bei einer leeren
// „Fehler 429“-Antwort (z. B. vom Proxy) ein eigener Satz.
export function wwhErrorText(err) {
  const message = typeof err?.message === 'string' ? err.message : ''
  if (message && !GENERIC_ERROR.test(message)) return message
  if (err?.status === 429) return t(WWH.zuViele)
  if (err?.status === 403) return t(WWH.nichtErlaubt)
  return message || t(WWH.nichtErlaubt)
}

// Stand einer eigenen Anmeldung als Satz.
export function checkinStatusText(status, ort) {
  if (status === 'bestaetigt') return t(WWH.freigegeben, { ort })
  if (status === 'abgelehnt') return t(WWH.abgelehnt, { ort })
  return t(WWH.wartet, { ort })
}

export function wishCountText(n) {
  return n === 1 ? t(WWH.einWunsch, { n }) : t(WWH.mehrWuensche, { n })
}

// Link zum Reiter „Wir waren hier“ eines Ortes (lib/portalTabs.js WWH_TAB).
export function ortLink(slug) {
  return `/p/${encodeURIComponent(slug)}?reiter=wir-waren-hier`
}
