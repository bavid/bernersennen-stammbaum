// Englische Texte der übrigen App, je Bereich eine Datei. Schlüssel ist der deutsche Text selbst (t('Neue Erinnerung')),
// der Wert die englische Fassung. Fehlt ein Eintrag, bleibt der deutsche Text stehen (lib/i18n/index.js translate).
// Gleiche deutsche Texte in zwei Dateien müssen gleich übersetzt sein - die spätere Datei gewinnt.
import common from './common.js'
import shell from './shell.js'
import animals from './animals.js'
import family from './family.js'
import publicPages from './public.js'
import partner from './partner.js'
import collage from './collage.js'
import invite from './invite.js'
import server from './server.js'
import extra from './extra.js'
import wwh from './wwh.js'
import banner from './banner.js'
import ui from './ui.js'
import onboarding from './onboarding.js'
import startpaket from './startpaket.js'
import share from './share.js'
import geschenk from './geschenk.js'
import netzwerk from './netzwerk.js'
import landing from './landing.js'
import gesundheit from './gesundheit.js'
import vermisst from './vermisst.js'
import fotoImport from './import.js'
import admin from './admin.js'

export default { ...admin, ...fotoImport, ...vermisst, ...gesundheit, ...landing,...netzwerk, ...geschenk, ...startpaket, ...share, ...onboarding, ...banner, ...ui, ...wwh, ...extra, ...server, ...invite, ...collage, ...partner, ...publicPages, ...family, ...animals, ...shell, ...common }
