'use strict'

// security-review Phase V2 (M-2): verlässt ein Haushalt eine Familie (oder wird entfernt bzw. gelöscht), dürfen die
// Einladungs-Codes, die er kannte, nicht weiter gelten:
// - immer: die offenen Codes, die er selbst für diese Familie angelegt hat (vouchers.created_by_family_id);
// - war er Stellvertretung oder Leitung, sah er alle Codes der Familie im Klartext (GET /api/vouchers/mine) - dann
//   werden alle offenen Einladungen zurückgezogen, die die Familie selbst ausgegeben hat. Die Start-Codes legt
//   GET /api/vouchers/mine danach wie gewohnt neu an (zurückgezogene zählen nicht zum Kontingent).
// Vom Admin für die Familie gedruckte Karten (issued_by_family_id NULL) bleiben - die kannte das Mitglied nie im Klartext.
// Ohne Abhängigkeiten außer der übergebenen db (lib/context.js und lib/families.js nutzen es beide).

const SEES_ALL_CODES = new Set(['stellvertretung', 'leitung'])

// Gibt die Anzahl zurückgezogener Codes zurück. role: die Rolle, die homeId in groupId hatte (vor dem Austritt).
function revokeInvitesOnLeave(db, { homeId, groupId, role }) {
  const seesAll = SEES_ALL_CODES.has(role)
  return db
    .prepare(
      `UPDATE vouchers SET revoked_at = datetime('now'), code_cipher = NULL
       WHERE join_family_id = @groupId AND dog_id IS NULL AND redeemed_at IS NULL AND revoked_at IS NULL
         AND (created_by_family_id = @homeId OR (@seesAll = 1 AND issued_by_family_id = @groupId))`
    )
    .run({ homeId, groupId, seesAll: seesAll ? 1 : 0 }).changes
}

module.exports = { revokeInvitesOnLeave }
