import { Fragment } from 'react'
import { highlightParts } from '../../lib/searchFold.js'

// Text mit hervorgehobenem Treffer (<mark>) - dieselbe Faltung wie der Server (lib/searchFold.js), damit "mueller" auch in
// "Müller" markiert wird.
export default function SearchHighlight({ text, query }) {
  return highlightParts(text, query).map((part, index) =>
    part.match ? (
      <mark key={index} className="search-mark">
        {part.text}
      </mark>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    )
  )
}
