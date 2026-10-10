import { t } from '../lib/i18n/index.js'

// Kurzer Hinweis unter den Kontaktformularen (siehe lib/kontaktDefaults.js).
export default function KontaktMerkenHinweis() {
  return <p className="field-hint kontakt-merken-hinweis">{t('Wir merken uns das nur auf diesem Gerät.')}</p>
}
