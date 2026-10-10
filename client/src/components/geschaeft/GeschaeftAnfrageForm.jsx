import { useEffect, useRef } from 'react'
import Honeypot from '../Honeypot.jsx'
import Icon from '../Icon.jsx'
import { Button } from '../ui/index.js'
import { BetriebFelder, KontaktFelder } from './GeschaeftFelder.jsx'
import TerminVorschlaege from './TerminVorschlaege.jsx'
import useGeschaeftAnfrage from '../../hooks/useGeschaeftAnfrage.js'
import useMediaQuery from '../../hooks/useMediaQuery.js'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { GESCHAEFT_SUCCESS, STEPS } from '../../lib/geschaeftAnfrage.js'
import { t } from '../../lib/i18n/index.js'

const DESKTOP_QUERY = '(min-width: 768px)'
const GROUPS = Object.freeze({ betrieb: BetriebFelder, kontakt: KontaktFelder, termin: TerminVorschlaege })

// Schrittanzeige am Handy: "Schritt 2 von 3 · Kontakt" und drei Punkte. Nach einem Schrittwechsel bekommt sie den
// Fokus - der Knopf "Weiter" verschwindet sonst unter dem Fokus weg.
function StepHeader({ step }) {
  const textRef = useRef(null)
  const shownStep = useRef(step)
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    if (!textRef.current?.closest('form')?.querySelector('[aria-invalid="true"]')) textRef.current?.focus()
  }, [step])
  return (
    <div className="geschaeft-steps">
      <p ref={textRef} className="geschaeft-steps-text" aria-live="polite" tabIndex={-1}>
        {t('Schritt {n} von {total}', { n: step + 1, total: STEPS.length })} · <strong>{t(STEPS[step].title)}</strong>
      </p>
      <ol className="geschaeft-steps-dots" aria-hidden="true">
        {STEPS.map((item, index) => (
          <li key={item.key} className={index <= step ? 'is-done' : ''} />
        ))}
      </ol>
    </div>
  )
}

function Group({ stepKey, number, showTitle, state, id }) {
  const Fields = GROUPS[stepKey]
  const step = STEPS[number]
  return (
    <section className="geschaeft-group" aria-labelledby={id(`${stepKey}-title`)}>
      <h3 id={id(`${stepKey}-title`)} className={showTitle ? 'geschaeft-group-title' : 'visually-hidden'}>
        <span className="geschaeft-group-nr" aria-hidden="true">
          {number + 1}
        </span>
        {t(step.title)}
      </h3>
      <Fields {...state} id={id} />
    </section>
  )
}

// Geschäftsanfrage auf /partner-werden (PartnerInfoPage): Betriebe fragen einen Partner-Zugang an und schlagen gleich
// Termine für ein erstes Gespräch vor. Am Handy drei ruhige Schritte (Betrieb → Kontakt → Termin), am Desktop dieselben
// Gruppen untereinander in einem Formular. Ablauf in hooks/useGeschaeftAnfrage.js, Regeln in lib/geschaeftAnfrage.js.
export default function GeschaeftAnfrageForm({ idPrefix = 'geschaeft' }) {
  const { theme } = useTheme()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const state = useGeschaeftAnfrage()
  const { step, next, back, website, setWebsite, error, sent, sending, handleSubmit, formRef, bannerRef, successRef } = state
  const id = (key) => `${idPrefix}-${key}`
  const lastStep = STEPS.length - 1
  const isWizard = !isDesktop

  if (sent) {
    return (
      <div ref={successRef} className="request-success geschaeft-success" role="status" tabIndex={-1}>
        <Icon name="check" />
        <p>{t(GESCHAEFT_SUCCESS)}</p>
      </div>
    )
  }

  function onSubmit(event) {
    if (isWizard && step < lastStep) {
      event.preventDefault()
      next()
      return
    }
    handleSubmit(event)
  }

  const visibleSteps = isWizard ? [step] : STEPS.map((_, index) => index)

  return (
    <form ref={formRef} className={`request-form geschaeft-form ${isWizard ? 'is-wizard' : 'is-desktop'}`} onSubmit={onSubmit} noValidate>
      <div className="request-why">
        <h3>{t('Warum anfragen?')}</h3>
        <p>
          {t(
            '{app} wächst Schritt für Schritt: Wir richten Partner-Profile einzeln ein. Erzählt uns kurz, wer ihr seid, und schlagt einen Termin für ein kurzes Kennenlernen vor.',
            { app: theme.appName }
          )}
        </p>
      </div>

      {isWizard && <StepHeader step={step} />}

      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      {visibleSteps.map((index) => (
        <Group key={STEPS[index].key} stepKey={STEPS[index].key} number={index} showTitle={!isWizard} state={state} id={id} />
      ))}

      <Honeypot id={id('hp')} value={website} onChange={setWebsite} />

      <div className="geschaeft-actions">
        {isWizard && step > 0 && (
          <Button type="button" variant="ghost" onClick={back}>
            <Icon name="arrowLeft" />
            {t('Zurück')}
          </Button>
        )}
        {isWizard && step < lastStep ? (
          <Button type="submit">
            {t('Weiter')}
            <Icon name="arrowRight" />
          </Button>
        ) : (
          <Button type="submit" disabled={sending}>
            <Icon name="send" />
            {sending ? t('Sende …') : t('Anfrage senden')}
          </Button>
        )}
      </div>
    </form>
  )
}
