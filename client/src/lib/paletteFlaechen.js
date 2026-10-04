// Die Flächen jeder Farbwelt (Abschrift aus styles/palettes.css - paletteFlaechen.test.js prüft, dass sie dort genau so
// stehen) und die Schrift auf dem Knopf (--on-rust). Nur dafür da, eine eigene Akzentfarbe gegen sie lesbar zu rechnen
// (lib/akzent.js): als Link auf Papier, Karte, vertiefter Fläche, tiefem Papier und im Kopf der Anmeldung.
export const PALETTE_FLAECHEN = Object.freeze({
  familienalbum: {
    hell: { scheme: 'hell', paper: '#fbf5ec', surface: '#ffffff', sunk: '#f8f0e5', deep: '#f3e8d9', hero: '#f3d9cc', onRust: '#ffffff' },
    dunkel: { scheme: 'dunkel', paper: '#1e1712', surface: '#2a211b', sunk: '#231b16', deep: '#271e18', hero: '#3a2a21', onRust: '#24170f' }
  },
  wald: {
    hell: { scheme: 'hell', paper: '#f1f3ec', surface: '#fbfcf8', sunk: '#f4f6ef', deep: '#e1e6d8', hero: '#e2ead7', onRust: '#fbfcf8' },
    dunkel: { scheme: 'dunkel', paper: '#0f140f', surface: '#1a211a', sunk: '#141a14', deep: '#171d17', hero: '#1a241b', onRust: '#0f140f' }
  },
  meer: {
    hell: { scheme: 'hell', paper: '#eef2f5', surface: '#fafcfd', sunk: '#f2f6f9', deep: '#dde5eb', hero: '#dbe7ef', onRust: '#fafcfd' },
    dunkel: { scheme: 'dunkel', paper: '#0c1217', surface: '#162029', sunk: '#111920', deep: '#131b22', hero: '#15212b', onRust: '#0c1217' }
  },
  lavendel: {
    hell: { scheme: 'hell', paper: '#f4f1f6', surface: '#fcfbfd', sunk: '#f7f4f9', deep: '#e7e1ec', hero: '#ebe2f2', onRust: '#fcfbfd' },
    dunkel: { scheme: 'dunkel', paper: '#120f16', surface: '#1e1925', sunk: '#17131c', deep: '#1a1620', hero: '#211b29', onRust: '#120f16' }
  },
  schiefer: {
    hell: { scheme: 'hell', paper: '#f0f1f3', surface: '#fbfbfc', sunk: '#f4f5f7', deep: '#e1e4e8', hero: '#e1e6ec', onRust: '#fbfbfc' },
    dunkel: { scheme: 'dunkel', paper: '#101214', surface: '#1b1f24', sunk: '#15181c', deep: '#181b1f', hero: '#1b2026', onRust: '#101214' }
  }
})
