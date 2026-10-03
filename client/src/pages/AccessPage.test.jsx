// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

const { telegram } = vi.hoisted(() => ({ telegram: vi.fn() }))
vi.mock('../api', () => ({ api: { partnerArea: { telegram } } }))

import AccessPage from './AccessPage.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  telegram.mockReset()
})

test('Phase V4b: "Benachrichtigungen" steht auf /zugang - auch in der Demo, dort nur zum Ansehen', async () => {
  telegram.mockResolvedValue({ eingerichtet: true, verbunden: false, getrennt: null, hinweise: {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value>
        <AccessPage family={{ id: 3, name: 'Hundeschule Demo-Wiese', art: 'partner' }} onFamilyChange={() => {}} />
      </DemoProvider>
    )
  )
  expect(container.querySelector('h1').textContent).toBe('Zugang')
  expect(container.textContent).toContain('Schlüssel und Benutzer: In der Demo nicht möglich.')
  const section = container.querySelector('.partner-telegram')
  expect(section.querySelector('h2').textContent).toBe('Benachrichtigungen')
  expect(section.querySelector('button').disabled).toBe(true)
  expect(telegram).toHaveBeenCalledTimes(1)
})
