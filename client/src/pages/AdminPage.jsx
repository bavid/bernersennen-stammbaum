import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import Icon from '../components/Icon.jsx'
import TabBar from '../components/TabBar.jsx'
import AdminLogin from '../components/AdminLogin.jsx'
import AdminSection from '../components/AdminSection.jsx'
import { adminCards } from '../components/AdminCards.jsx'
import useAdminTab from '../hooks/useAdminTab.js'
import { t } from '../lib/i18n/index.js'
import { ADMIN_SECTIONS, adminPanelId, adminSubCounts, adminTabCounts, openCountText } from '../lib/adminTabs.js'
import { Button } from '../components/ui/index.js'

// Diese Unterreiter sind von Anfang an eingehängt (nur verborgen): sie melden die Zähler an den Reitern. Alle
// anderen kommen beim ersten Öffnen dazu und bleiben dann eingehängt, damit Eingaben einen Wechsel überstehen.
const ALWAYS_MOUNTED = ['anfragen', 'freigaben']

const MAIN_TABS = ADMIN_SECTIONS.map((section) => ({ key: section.key, label: section.label }))

function AdminHeader({ tab, counts, onSelect, onLogout }) {
  return (
    <header className="admin-header">
      <div className="admin-header-inner">
        <div className="admin-header-row">
          <h1 className="admin-brand">
            <Link to="/" className="admin-brand-mark" aria-label="Zur Startseite">
              <ThemeMark size={30} />
            </Link>
            Admin
          </h1>
          <span className="admin-header-actions">
            {/* Phase 5 Task 5: Vorführseite mit Demo-Kacheln und Portal-Vorschau (AdminPresentPage). */}
            <Button to="/admin/praesentation" as={Link} variant="ghost">
              <Icon name="eye" /> Präsentation
            </Button>
            {/* Box-System: Katalog aller Bausteine (AdminBausteinePage). */}
            <Button to="/admin/bausteine" as={Link} variant="ghost">
              <Icon name="layers" /> Bausteine
            </Button>
            <Button type="button" variant="ghost" onClick={onLogout}>
              <Icon name="logout" /> Abmelden
            </Button>
          </span>
        </div>
        <TabBar
          tabs={MAIN_TABS.map((item) => ({ ...item, label: t(item.label) }))}
          current={tab}
          counts={counts}
          label="Admin-Bereiche"
          idPrefix="admin-tab"
          panelId={adminPanelId}
          countText={openCountText}
          className="admin-tabs"
          onSelect={onSelect}
        />
      </div>
    </header>
  )
}

// Zähler aus den Karten: offene Anfragen, Beiträge zur Freigabe und Nachrichten (null, solange die Karte noch lädt).
function useAdminData() {
  const [overview, setOverview] = useState(null)
  const [partners, setPartners] = useState([])
  const [error, setError] = useState(null)
  const [pendingCount, setPendingCount] = useState(null)
  const [openRequests, setOpenRequests] = useState(null)
  // Phase P2: "Freigaben" und "Empfehlungen" zeigen dieselben Zeilen - ändert eine Karte etwas, zählt
  // promotionsVersion hoch und beide laden neu.
  const [promotionsVersion, setPromotionsVersion] = useState(0)
  const bumpPromotions = useCallback(() => setPromotionsVersion((version) => version + 1), [])

  useEffect(() => {
    api.admin
      .overview()
      .then(setOverview)
      .catch((err) => setError(err.message))
  }, [])

  // Eigener, kleiner Ladevorgang für die Partner-Auswahl in AdminVouchers ("Für Partner") und AdminPromotions
  // ("Partner (optional)") - AdminPartners lädt seine eigene (vollständigere) Liste unabhängig selbst.
  useEffect(() => {
    api.admin
      .partners()
      .then(setPartners)
      .catch(() => setPartners([]))
  }, [])

  const handleMessageCount = useCallback(
    (delta) =>
      setOverview((current) => ({
        ...current,
        stats: { ...current.stats, openMessages: Math.max(0, current.stats.openMessages + delta) }
      })),
    []
  )

  const todo = { openRequests, pendingPosts: pendingCount, openMessages: overview?.stats.openMessages ?? null }
  const report = { requests: setOpenRequests, posts: setPendingCount, messages: handleMessageCount }
  const promotions = { version: promotionsVersion, bump: bumpPromotions }
  return { overview, partners, setPartners, error, todo, report, promotions }
}

function Dashboard({ onLogout }) {
  const { current, select, subOf } = useAdminTab()
  const data = useAdminData()
  const [opened, setOpened] = useState([])
  // Aus "Zu tun" gewechselt: der Fokus springt auf den neuen Unterreiter (der Knopf in "Zu tun" ist dann verborgen).
  const focusAfterSwitch = useRef(false)

  useEffect(() => {
    setOpened((list) => (list.includes(current.bereich) ? list : [...list, current.bereich]))
    if (!focusAfterSwitch.current) return
    focusAfterSwitch.current = false
    document.getElementById(`admin-sub-${current.bereich}`)?.focus()
  }, [current.bereich])

  function openTab(key) {
    focusAfterSwitch.current = true
    select(key)
  }

  const { overview, error, todo } = data
  const isMounted = (key) => ALWAYS_MOUNTED.includes(key) || key === current.bereich || opened.includes(key)
  const cards = overview && adminCards({ ...data, bereich: current.bereich, onOpenTab: openTab })
  const subCounts = adminSubCounts(todo)

  return (
    <div className="admin-shell">
      <AdminHeader tab={current.tab} counts={adminTabCounts(todo)} onSelect={(key) => select(key)} onLogout={onLogout} />

      <main className="admin-main">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!overview && !error && <p className="muted">Lade …</p>}
        {cards &&
          ADMIN_SECTIONS.map((section) => (
            <AdminSection
              key={section.key}
              section={section}
              active={section.key === current.tab}
              bereich={subOf(section.key)}
              cards={cards}
              counts={subCounts}
              isMounted={isMounted}
              onSelect={select}
            />
          ))}
      </main>
    </div>
  )
}

export default function AdminPage() {
  const [admin, setAdmin] = useState(undefined)

  useEffect(() => {
    api.admin
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null))
  }, [])

  async function handleLogout() {
    try {
      await api.admin.logout()
    } finally {
      setAdmin(null)
    }
  }

  if (admin === undefined) return <div className="splash" aria-busy="true" />
  if (!admin) return <AdminLogin onLogin={setAdmin} />
  return <Dashboard onLogout={handleLogout} />
}
