import { renderToStaticMarkup } from 'react-dom/server'

// Nur für die Tests der Bausteine: rendert statisch in ein Element (jsdom) und gibt das erste Kind zurück.
export function render(element) {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(element)
  return host.firstElementChild
}
