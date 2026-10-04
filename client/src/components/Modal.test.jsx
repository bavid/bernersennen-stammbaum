// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import Modal from './Modal.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt showModal/close am <dialog> nicht.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

test('beim Öffnen bekommt das Feld mit data-autofocus den Fokus (autoFocus griffe, solange der Dialog noch zu ist)', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <Modal open title="Neues Tier anlegen" onClose={() => {}}>
        <input name="erstes" />
        <input name="name" data-autofocus="" />
      </Modal>
    )
  )
  expect(container.querySelector('dialog').open).toBe(true)
  expect(document.activeElement).toBe(container.querySelector('[name="name"]'))
})
