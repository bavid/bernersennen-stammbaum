import { t } from '../lib/i18n/index.js'

// Übergabe-Code eines Tierheims: Einwilligung „darf weiter mitlesen“ beim Einlösen (RedeemForm) und beim Übernehmen in ein
// bestehendes Zuhause (App.jsx). Der Hinweis sagt ausdrücklich, was das Tierheim dann sieht - auch den Namen des Zuhauses.
export default function HandoverConsent({ shelterName, checked, onChange }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {t('{name} darf weiter mitlesen (freiwillig, jederzeit widerrufbar)', { name: shelterName })}
      </label>
      <p className="field-hint">{t('Dann sieht {name} die nicht privaten Erinnerungen und den Namen eures Zuhauses.', { name: shelterName })}</p>
    </>
  )
}
