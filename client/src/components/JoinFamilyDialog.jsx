import { useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import { t } from '../lib/i18n/index.js'

const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 80
const DEMO_HINT_ID = 'join-family-demo-hint'

// Aus "Mein Zuhause" heraus: einer bestehenden Familie/einem Rudel mit dessen Passwort beitreten,
// oder eine neue gründen. Der aktive Bereich bleibt dabei "Mein Zuhause" (der Server wechselt nicht
// automatisch), onChange bekommt trotzdem das volle "me"-Objekt (jetzt mit der neuen Mitgliedschaft).
// initialTab (Phase W): 'join' (Standard) oder 'create' - die Familien-Seite öffnet den Dialog direkt im passenden Modus.
export default function JoinFamilyDialog({ onChange, onClose, initialTab = 'join' }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [tab, setTab] = useState(initialTab === 'create' ? 'create' : 'join')
  const [joinPassword, setJoinPassword] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupPassword, setGroupPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function selectTab(next) {
    setTab(next)
    setError(null)
  }

  async function handleJoin(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const me = await api.joinFamily(joinPassword)
      onChange(me)
      toast(t('Beigetreten.'))
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const me = await api.createGroup({ name: groupName, password: groupPassword })
      onChange(me)
      toast(t('„{name}“ gegründet.', { name: groupName }))
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="join-family">
      <div className="segmented join-family-switch" role="group" aria-label={t('Modus')}>
        <button type="button" aria-pressed={tab === 'join'} onClick={() => selectTab('join')}>
          {t('Beitreten')}
        </button>
        <button type="button" aria-pressed={tab === 'create'} onClick={() => selectTab('create')}>
          {t('Neu gründen')}
        </button>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {tab === 'join' ? (
        <form className="form-stack" onSubmit={handleJoin}>
          <div className="field">
            <label className="field-label" htmlFor="join-family-password">
              {words.groupPassword}
            </label>
            <input
              id="join-family-password"
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              autoComplete="off"
              disabled={isDemo}
              aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
              required
            />
          </div>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
          <div className="form-actions">
            <span className="form-actions-spacer" />
            <button type="submit" className="btn btn-primary" disabled={isDemo || loading || !joinPassword}>
              {loading ? t('Beitrete …') : t('Beitreten')}
            </button>
          </div>
        </form>
      ) : (
        <form className="form-stack" onSubmit={handleCreate}>
          <div className="field">
            <label className="field-label" htmlFor="join-family-name">
              {words.groupName}
            </label>
            <input
              id="join-family-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={words.groupNamePlaceholder}
              maxLength={MAX_NAME_LENGTH}
              disabled={isDemo}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="join-family-create-password">
              {t('Gemeinsames Passwort')}
            </label>
            <input
              id="join-family-create-password"
              type="password"
              value={groupPassword}
              onChange={(e) => setGroupPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              disabled={isDemo}
              aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
              required
            />
          </div>
          <p className="field-hint">{t('Teilt das Passwort mit allen, die dazugehören sollen.')}</p>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
          <div className="form-actions">
            <span className="form-actions-spacer" />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isDemo || loading || !groupName.trim() || !groupPassword}
            >
              {loading ? t('Lege an …') : words.createGroup}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
