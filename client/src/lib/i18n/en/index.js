// Englische Texte der übrigen App, je Bereich eine Datei. Schlüssel ist der deutsche Text selbst (t('Neue Erinnerung')),
// der Wert die englische Fassung. Fehlt ein Eintrag, bleibt der deutsche Text stehen (lib/i18n/index.js translate).
import shell from './shell.js'
import common from './common.js'

export default { ...common, ...shell }
