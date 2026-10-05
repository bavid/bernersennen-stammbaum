// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import useShowMore from './useShowMore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
})

function List({ items, visible, fromEnd }) {
  const more = useShowMore(items, visible, { fromEnd })
  return (
    <>
      <ul ref={more.focusRef}>
        {more.shown.map((item) => (
          <li key={item}>
            <button type="button">{item}</button>
          </li>
        ))}
      </ul>
      {more.hidden > 0 && (
        <button type="button" className="more" onClick={more.expand}>
          Weitere ({more.hidden})
        </button>
      )}
      <output>{String(more.expanded)}</output>
    </>
  )
}

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<List {...props} />))
}

const shown = () => [...container.querySelectorAll('li')].map((li) => li.textContent)

describe('useShowMore', () => {
  test('zeigt zuerst `visible` Einträge und zählt den Rest; Aufklappen zeigt alle und fokussiert den ersten neuen', async () => {
    await render({ items: ['a', 'b', 'c', 'd', 'e'], visible: 2 })
    expect(shown()).toEqual(['a', 'b'])
    expect(container.querySelector('.more').textContent).toBe('Weitere (3)')

    await act(async () => container.querySelector('.more').click())
    expect(shown()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(container.querySelector('.more')).toBeNull()
    expect(container.querySelector('output').textContent).toBe('true')
    expect(document.activeElement.textContent).toBe('c')
  })

  test('passt alles hinein, gibt es keinen Knopf - auch ohne Liste', async () => {
    await render({ items: ['a', 'b'], visible: 2 })
    expect(shown()).toEqual(['a', 'b'])
    expect(container.querySelector('.more')).toBeNull()
    await render({ items: null, visible: 2 })
    expect(shown()).toEqual([])
  })

  test('fromEnd: die letzten Einträge zuerst (Antworten), Aufklappen fokussiert den ersten der Liste', async () => {
    await render({ items: ['a', 'b', 'c', 'd'], visible: 2, fromEnd: true })
    expect(shown()).toEqual(['c', 'd'])
    await act(async () => container.querySelector('.more').click())
    expect(shown()).toEqual(['a', 'b', 'c', 'd'])
    expect(document.activeElement.textContent).toBe('a')
  })
})
