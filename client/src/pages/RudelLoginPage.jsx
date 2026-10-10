import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import Icon from '../components/Icon.jsx'
import PasswordField from '../components/PasswordField.jsx'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { tList, useLang, useT } from '../lib/i18n/index.js'
import { Button } from '../components/ui/index.js'

// Anmeldeseite der Rudel-Instanz (lib/instanzModus.js): Kopf, Begrüßung, EINE Karte mit dem Familien-Passwort,
// Sprachwahl und Impressum/Datenschutz - kein Gutschein, keine Demo, kein Partner-Einstieg, keine App-Karte.
export default function RudelLoginPage({ onLogin }) {
  const { theme } = useTheme()
  const t = useT()
  const lang = useLang()
  const de = lang === 'de'
  const headline = de ? theme.texts.loginHeadline : tList('login.headline')

  return (
    <div className="login rudel-login">
      <header className="login-top">
        <span className="login-brand">
          <ThemeMark size={36} className="login-mark" />
          <span>{theme.appName}</span>
        </span>
        <div className="login-lang">
          <LanguageSwitch withIcon />
        </div>
      </header>

      <section className="login-hero">
        <div className="login-hero-grid">
          <div className="login-hero-inner">
            <p className="login-kicker">{de ? theme.texts.loginKicker : t('login.kicker')}</p>
            <p className="login-headline">
              {headline[0]}
              <br />
              <em>{headline[1]}</em>
            </p>
            <p className="login-lede">{de ? theme.texts.loginLede : t('login.lede')}</p>
          </div>
          <div className="login-main">
            <section className="login-card login-entry" aria-labelledby="rudel-login-title">
              <div className="login-card-head">
                <p className="login-entry-label">
                  <Icon name="paw" /> {t('login.rudel.label')}
                </p>
                <h1 id="rudel-login-title">{t('login.mode.login.title')}</h1>
                <p className="muted">{t('login.rudel.lede')}</p>
              </div>
              <PasswordLogin onLogin={onLogin} t={t} />
            </section>
          </div>
        </div>
      </section>

      <footer className="login-footer">
        <Link to="/impressum">{t('login.footer.imprint')}</Link>
        <Link to="/datenschutz">{t('login.footer.privacy')}</Link>
      </footer>
    </div>
  )
}

function PasswordLogin({ onLogin, t }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      onLogin(await api.login(password))
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <PasswordField
        id="rudel-password"
        label={t('login.rudel.password')}
        value={password}
        onChange={setPassword}
        autoFocus
        autoComplete="current-password"
      />
      <Button size="lg" block type="submit" disabled={loading || !password}>
        {loading ? t('login.form.opening') : t('login.form.open')}
      </Button>
    </form>
  )
}
