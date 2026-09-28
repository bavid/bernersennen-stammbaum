import AdminField, { fieldProps } from './AdminField.jsx'
import { SETUP_TYPE_OPTIONS, setupTypeLabel } from '../lib/partnerTypes.js'
import { isBoundPartnerAccess } from '../lib/partnerSetup.js'

const NAME_MAX_LENGTH = 120 // wie server/lib/partners.js MAX_NAME_LENGTH
const PLZ_LENGTH = 5

function errorClass(error) {
  return error ? 'has-error' : ''
}

// Partner-Profil einrichten (/v mit einem Partner-Zugang, RedeemForm): Einleitung und - bei einem
// ungebundenen Zugang - Name, Typ und PLZ. Ein gebundener Zugang (access.partnerName, der Partner ist
// schon angelegt) begrüßt nur. access: { partnerTyp, partnerName } aus lib/partnerSetup.js
// partnerAccessFrom; values { name, typ, plz }; errors: Feldfehler aus validatePartnerSetup; onChange
// bekommt nur die geänderten Felder. Die Pflichtfelder prüft RedeemForm per JS (kein required/pattern,
// sonst blockiert schon der Browser still das Absenden), aria-required sagt es Screenreadern trotzdem.
export default function PartnerSetupFields({ access, values, errors, onChange }) {
  const isBound = isBoundPartnerAccess(access)

  return (
    <section className="partner-setup form-stack" aria-labelledby="partner-setup-title">
      <div className="partner-setup-intro">
        <h2 id="partner-setup-title">Partner-Profil einrichten</h2>
        <p>
          Willkommen! Mit diesem Zugang richtet ihr euer kostenloses Partner-Profil ein – euer öffentlicher Auftritt bei
          Familie auf Pfoten.
        </p>
      </div>

      {isBound ? (
        <p className="partner-setup-welcome">Willkommen, {access.partnerName}!</p>
      ) : (
        <>
          <AdminField
            id="partner-name"
            label="Name eurer Hundeschule, eures Tierheims …"
            error={errors.name}
            className={errorClass(errors.name)}
          >
            <input
              {...fieldProps('partner-name', { error: errors.name })}
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="organization"
              aria-required="true"
            />
          </AdminField>

          {access.partnerTyp ? (
            <div className="field">
              <span className="field-label">Typ</span>
              <p className="partner-setup-typ-fixed">{setupTypeLabel(access.partnerTyp)}</p>
            </div>
          ) : (
            <AdminField
              id="partner-typ"
              label="Was bietet ihr an?"
              error={errors.typ}
              className={errorClass(errors.typ)}
            >
              <select
                {...fieldProps('partner-typ', { error: errors.typ })}
                value={values.typ}
                onChange={(e) => onChange({ typ: e.target.value })}
                aria-required="true"
              >
                <option value="">Bitte wählen …</option>
                {SETUP_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </AdminField>
          )}

          <AdminField
            id="partner-plz"
            label="Postleitzahl"
            error={errors.plz}
            hint="Damit man euch in der Umgebung findet."
            className={errorClass(errors.plz)}
          >
            <input
              {...fieldProps('partner-plz', { error: errors.plz, hint: true })}
              value={values.plz}
              onChange={(e) => onChange({ plz: e.target.value.replace(/\D/g, '').slice(0, PLZ_LENGTH) })}
              inputMode="numeric"
              maxLength={PLZ_LENGTH}
              placeholder="z. B. 10115"
              autoComplete="postal-code"
              aria-required="true"
            />
          </AdminField>
        </>
      )}
    </section>
  )
}
