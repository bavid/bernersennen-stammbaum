// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import HousemateLane from './HousemateLane.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const anchor = { id: 1, name: 'Nele', tierart: 'hund', geschlecht: 'huendin' }
const member = { id: 2, name: 'Mira', tierart: 'hund', geschlecht: 'huendin' }

const groups = [{ anchorId: 1, memberIds: [2], members: [member], anchor }]
const placement = new Map([[1, { x: 0, width: 100, stemX: 50 }]])

// PedigreeTree liefert stabile Ref-Callback-Fabriken (useRefMap) – hier reicht ein no-op je Schlüssel.
const noopRefFactory = () => () => {}

async function render({ isDemo = false, onAddMitbewohner } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={isDemo}>
          <HousemateLane
            index={0}
            groups={groups}
            placement={placement}
            trackLeft={0}
            trackRef={() => {}}
            setGroupRef={noopRefFactory}
            setCardRef={noopRefFactory}
            cardProps={() => ({})}
            onAddMitbewohner={onAddMitbewohner}
          />
        </DemoProvider>
      </MemoryRouter>
    )
  )
  return container
}

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

describe('HousemateLane – "+ Mitbewohner"', () => {
  test('zeigt den Knopf in der Gruppe und ruft den Handler mit dem Haupttier der Gruppe auf', async () => {
    const onAddMitbewohner = vi.fn()
    await render({ onAddMitbewohner })

    const button = container.querySelector('.lane-add-btn')
    expect(button).not.toBeNull()
    expect(button.closest('.lane-group')).not.toBeNull()

    act(() => button.click())
    expect(onAddMitbewohner).toHaveBeenCalledWith(anchor)
  })

  test('ohne onAddMitbewohner-Handler erscheint kein Knopf', async () => {
    await render()
    expect(container.querySelector('.lane-add-btn')).toBeNull()
  })

  test('im Demo-Modus erscheint kein Knopf', async () => {
    await render({ isDemo: true, onAddMitbewohner: vi.fn() })
    expect(container.querySelector('.lane-add-btn')).toBeNull()
  })
})

describe('HousemateLane – geteiltes Haupttier', () => {
  test('kein Knopf, wenn das Haupttier der Gruppe nicht bearbeitbar ist (can_edit: false)', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const sharedAnchor = { ...anchor, can_edit: false }
    await act(async () =>
      root.render(
        <MemoryRouter>
          <DemoProvider value={false}>
            <HousemateLane
              index={0}
              groups={[{ anchorId: 1, memberIds: [2], members: [member], anchor: sharedAnchor }]}
              placement={placement}
              trackLeft={0}
              trackRef={() => {}}
              setGroupRef={noopRefFactory}
              setCardRef={noopRefFactory}
              cardProps={() => ({})}
              onAddMitbewohner={vi.fn()}
            />
          </DemoProvider>
        </MemoryRouter>
      )
    )
    expect(container.querySelector('.lane-add-btn')).toBeNull()
  })
})
