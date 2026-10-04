// Übergabe-Code eines Tierheims: Einwilligung „darf weiter mitlesen“ beim Einlösen (RedeemForm) und beim Übernehmen in ein
// bestehendes Zuhause (App.jsx). Der Hinweis sagt ausdrücklich, was das Tierheim dann sieht - auch den Namen des Zuhauses.
export default function HandoverConsent({ shelterName, checked, onChange }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {shelterName} darf weiter mitlesen (freiwillig, jederzeit widerrufbar)
      </label>
      <p className="field-hint">Dann sieht {shelterName} die nicht privaten Erinnerungen und den Namen eures Zuhauses.</p>
    </>
  )
}
