import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import ContactPartnerForm from './ContactPartnerForm.jsx'
import { PREVIEW_DISABLED_HINT, useIsPreview } from '../lib/preview.js'
import { DEMO_CONTACT_HINT, contactFormState } from '../lib/contactPartner.js'

// ?demo=1 geht mit, wenn die Seite selbst so geladen wurde (wie PartnerPortalPage demoParam).
function demoParam(search) {
  return new URLSearchParams(search).get('demo') === '1' ? '1' : undefined
}

// "Schreib uns" (Phase P2) auf Portal und Steckbrief: öffnet ContactPartnerForm in einem Modal. label: z. B.
// "Schreib uns zu Benno" vom Steckbrief, dann mit bezugSlug. Sichtbar, aber deaktiviert (samt Hinweis) in der
// Kundensicht (lib/preview.js) und bei Demo-Partnern (kontaktformularDemo) - dort verschickt niemand etwas.
export default function ContactPartnerButton({ partner, bezugSlug, label = 'Schreib uns', className = 'btn btn-primary' }) {
  const preview = useIsPreview()
  const { search } = useLocation()
  const [open, setOpen] = useState(false)
  const disabledHint = preview ? PREVIEW_DISABLED_HINT : contactFormState(partner) === 'demo' ? DEMO_CONTACT_HINT : null

  if (disabledHint) {
    return (
      <span className="contact-partner-preview">
        <button type="button" className={className} disabled title={disabledHint} aria-description={disabledHint}>
          <Icon name="message" />
          {label}
        </button>
        <span className="field-hint">{disabledHint}</span>
      </span>
    )
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Icon name="message" />
        {label}
      </button>
      <Modal open={open} title={`Nachricht an ${partner.name}`} onClose={() => setOpen(false)}>
        <ContactPartnerForm partner={partner} bezugSlug={bezugSlug} demo={demoParam(search)} />
      </Modal>
    </>
  )
}
