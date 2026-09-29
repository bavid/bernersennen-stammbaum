// Formular-Stand eines Partners in der Admin-Partnerpflege (AdminPartners, AdminPartnerRow) - geteilt,
// weil PUT /api/admin/partners/:id immer den vollen Datensatz validiert (server/lib/partners.js
// validatePartner, z. B. ist der Name Pflicht): auch Pausieren/Aktivieren und Sperren schicken den
// kompletten, aus der Server-Zeile abgeleiteten Stand, nur mit dem einen geänderten Feld.

export const STATUS_LABELS = { entwurf: 'Entwurf', aktiv: 'Aktiv', pausiert: 'Pausiert' }

// Formularwerte (camelCase) aus einer Server-Zeile (snake_case) bzw. leer beim Neuanlegen.
export function initialState(partner) {
  return {
    name: partner?.name || '',
    slug: partner?.slug || '',
    typ: partner?.typ || 'tierheim',
    status: partner?.status || 'entwurf',
    istPartner: partner ? Boolean(partner.ist_partner) : true,
    plz: partner?.plz || '',
    website: partner?.website || '',
    spendenUrl: partner?.spenden_url || '',
    vermittlungUrl: partner?.vermittlung_url || '',
    kontaktEmail: partner?.kontakt_email || '',
    kontaktTelefon: partner?.kontakt_telefon || '',
    portalTitel: partner?.portal_titel || '',
    portalText: partner?.portal_text || '',
    farbe: partner?.farbe || ''
  }
}

// Ohne gesperrt/kontaktFormularUrl/kontaktformularAktiv: fehlen sie, behält der Server den bisherigen Wert.
export function toPayload(form) {
  return {
    name: form.name,
    slug: form.slug || null,
    typ: form.typ,
    status: form.status,
    istPartner: form.istPartner,
    plz: form.plz || null,
    website: form.website || null,
    spendenUrl: form.spendenUrl || null,
    vermittlungUrl: form.vermittlungUrl || null,
    kontaktEmail: form.kontaktEmail || null,
    kontaktTelefon: form.kontaktTelefon || null,
    portalTitel: form.portalTitel || null,
    portalText: form.portalText || null,
    farbe: form.farbe || null
  }
}

// Der volle Datensatz einer Server-Zeile mit einzelnen Änderungen (z. B. { status } oder { gesperrt }).
export function rowPayload(partner, changes) {
  return { ...toPayload(initialState(partner)), ...changes }
}
