// Breite der senkrechten Scrollleiste als CSS-Variable --sbw: damit kann der Stammbaum die volle
// Fensterbreite nutzen (100vw zählt die Leiste unter Windows mit und würde seitlich überstehen).
export function trackScrollbarWidth() {
  const root = document.documentElement
  const update = () => root.style.setProperty('--sbw', `${window.innerWidth - root.clientWidth}px`)
  update()
  window.addEventListener('resize', update)
  // Die Leiste erscheint auch, wenn die Seite länger wird – ohne resize-Ereignis
  new ResizeObserver(update).observe(root)
}
