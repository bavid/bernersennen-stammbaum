import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import Icon from '../components/Icon.jsx'
import TabBar from '../components/TabBar.jsx'
import AdminLogin from '../components/AdminLogin.jsx'
import AdminOverview from '../components/AdminOverview.jsx'
import AdminFamilyList from '../components/AdminFamilyList.jsx'
import AdminMessages from '../components/AdminMessages.jsx'
import AdminVouchers from '../components/AdminVouchers.jsx'
import AdminPartners from '../components/AdminPartners.jsx'
import AdminPromotions from '../components/AdminPromotions.jsx'
import AdminCommunityBanner from '../components/AdminCommunityBanner.jsx'
import AdminPostApproval from '../components/AdminPostApproval.jsx'
import AdminSupport from '../components/AdminSupport.jsx'
import AdminLog from '../components/AdminLog.jsx'
import AdminAnfragen from '../components/AdminAnfragen.jsx'
import AdminNotify from '../components/AdminNotify.jsx'
import AdminEinladungskarte from '../components/AdminEinladungskarte.jsx'
import AdminHinweise from '../components/AdminHinweise.jsx'
import AdminServer from '../components/AdminServer.jsx'
import AdminFinanzierung from '../components/AdminFinanzierung.jsx'
import AdminLandeadressen from '../components/AdminLandeadressen.jsx'
import useAdminTab from '../hooks/useAdminTab.js'
import { ADMIN_TABS, adminPanelId, adminTabCounts, openCountText } from '../lib/adminTabs.js'

// Gültiges Ziel für einen Partner-Gutscheinstapel (siehe routes/admin.js POST /voucher-batches)
function partnerVoucherEligible(partner) {
  return partner.status === 'entwurf' || partner.status === 'aktiv'
}

// An einen Partner gebundener Partner-Zugang (Phase P): nur ein echter Partner (keine Demo) ohne eigenen
// Bereich (server/lib/partnerAccess.js findBindablePartner).
function partnerAccessBindable(partner) {
  return !partner.is_demo && !partner.area_family_id
}

// Diese Reiter sind von Anfang an eingehängt (nur verborgen): sie melden die Zähler an den Reitern. Alle
// anderen kommen beim ersten Öffnen dazu und bleiben dann eingehängt, damit Eingaben einen Wechsel überstehen.
const ALWAYS_MOUNTED = ['anfragen', 'freigaben']

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
            <Link to="/admin/praesentation" className="btn btn-ghost">
              <Icon name="eye" /> Präsentation
            </Link>
            {/* Box-System: Katalog aller Bausteine (AdminBausteinePage). */}
            <Link to="/admin/bausteine" className="btn btn-ghost">
              <Icon name="layers" /> Bausteine
            </Link>
            <button type="button" className="btn btn-ghost" onClick={onLogout}>
              <Icon name="logout" /> Abmelden
            </button>
          </span>
        </div>
        <TabBar
          tabs={ADMIN_TABS}
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

// Ein Reiter-Panel: immer im DOM (Ziel von aria-controls), der Inhalt erst, wenn der Reiter einmal offen war.
function Panel({ id, tab, mounted, children }) {
  return (
    <div id={adminPanelId(id)} role="tabpanel" aria-labelledby={`admin-tab-${id}`} className="admin-panel" hidden={tab !== id}>
      {mounted && children}
    </div>
  )
}

function Dashboard({ onLogout }) {
  const [tab, selectTab] = useAdminTab()
  const [overview, setOverview] = useState(null)
  const [partners, setPartners] = useState([])
  const [error, setError] = useState(null)
  const [opened, setOpened] = useState([])
  // Phase P2: "Freigaben" und "Empfehlungen & Anzeigen" zeigen dieselben Zeilen - ändert eine Karte etwas,
  // zählt promotionsVersion hoch und beide laden neu. pendingCount/openRequests: Zähler an den Reitern und in
  // "Zu tun" (null, solange die Karte noch lädt).
  const [promotionsVersion, setPromotionsVersion] = useState(0)
  const [pendingCount, setPendingCount] = useState(null)
  const [openRequests, setOpenRequests] = useState(null)
  const bumpPromotions = useCallback(() => setPromotionsVersion((version) => version + 1), [])
  // Aus "Zu tun" gewechselt: der Fokus springt auf den neuen Reiter (der Knopf in "Zu tun" ist dann verborgen).
  const focusTabAfterSwitch = useRef(false)

  useEffect(() => {
    api.admin
      .overview()
      .then(setOverview)
      .catch((err) => setError(err.message))
  }, [])

  // Eigener, kleiner Ladevorgang für die Partner-Auswahl in AdminVouchers ("Für Partner") und
  // AdminPromotions ("Partner (optional)") - AdminPartners lädt seine eigene (vollständigere) Liste
  // unabhängig selbst, wie AdminMessages/AdminVouchers auch.
  useEffect(() => {
    api.admin
      .partners()
      .then(setPartners)
      .catch(() => setPartners([]))
  }, [])

  useEffect(() => {
    setOpened((current) => (current.includes(tab) ? current : [...current, tab]))
    if (!focusTabAfterSwitch.current) return
    focusTabAfterSwitch.current = false
    document.getElementById(`admin-tab-${tab}`)?.focus()
  }, [tab])

  function openTab(key) {
    focusTabAfterSwitch.current = true
    selectTab(key)
  }

  const handleMessageCount = useCallback(
    (delta) =>
      setOverview((current) => ({
        ...current,
        stats: { ...current.stats, openMessages: Math.max(0, current.stats.openMessages + delta) }
      })),
    []
  )

  const openMessages = overview?.stats.openMessages ?? null
  const todo = { openRequests, pendingPosts: pendingCount, openMessages }
  const isMounted = (key) => ALWAYS_MOUNTED.includes(key) || key === tab || opened.includes(key)
  const panel = (id, children) => (
    <Panel id={id} tab={tab} mounted={isMounted(id)}>
      {children}
    </Panel>
  )

  return (
    <div className="admin-shell">
      <AdminHeader tab={tab} counts={adminTabCounts(todo)} onSelect={selectTab} onLogout={onLogout} />

      <main className="admin-main">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!overview && !error && <p className="muted">Lade …</p>}
        {overview && (
          <>
            {panel('uebersicht', <AdminOverview stats={overview.stats} todo={todo} onOpenTab={openTab} />)}
            {/* Phase N: Anfragen (Gutschein, Partner-Zugang) - die Telegram-Benachrichtigungen dazu unter "Einstellungen". */}
            {panel('anfragen', <AdminAnfragen onCountChange={setOpenRequests} />)}
            {/* Phase P2: eingereichte Beiträge der Partner. */}
            {panel(
              'freigaben',
              <AdminPostApproval version={promotionsVersion} onChanged={bumpPromotions} onCountChange={setPendingCount} />
            )}
            {panel(
              'gutscheine',
              <AdminVouchers
                joinableFamilies={overview.families.filter((family) => family.art === 'rudel' && !family.is_demo)}
                partners={partners.filter(partnerVoucherEligible)}
                accessPartners={partners.filter(partnerAccessBindable)}
              />
            )}
            {panel('partner', <AdminPartners onChange={setPartners} />)}
            {panel(
              'empfehlungen',
              <div className="admin-panel-stack">
                {/* Reiter "Entdecken" (Phase 3 Task 5): dieselbe Partnerliste füllt die Partner-Auswahl. */}
                <AdminPromotions partners={partners} version={promotionsVersion} onChanged={bumpPromotions} />
                {/* Band „Mit dabei“ oben auf der Startseite: Partner des Monats, Zahlen, eigener Eintrag - mit Vorschau. */}
                <AdminCommunityBanner />
                <AdminSupport />
                {/* Plan 2027 Kap. 6: eigene Landeadresse je Kanal (/fb, /anzeige-herbst) - anonym gezählt. */}
                <AdminLandeadressen />
              </div>
            )}
            {panel('familien', <AdminFamilyList families={overview.families} />)}
            {panel('nachrichten', <AdminMessages onCountChange={handleMessageCount} />)}
            {/* Phase N Task 5: globale Hinweise - das Band oben auf allen Seiten, mit Vorschau. */}
            {panel('hinweise', <AdminHinweise />)}
            {/* Phase F: „So finanzieren wir uns“ - Spenden-Hinweis, Ziel und Quartale, mit Vorschau der Seite. */}
            {panel('finanzierung', <AdminFinanzierung />)}
            {/* Einladungskarten: die Rückseite, die Familie auf Pfoten auf jede Karte der Partner druckt. */}
            {panel(
              'einstellungen',
              <div className="admin-panel-stack">
                <AdminNotify />
                <AdminEinladungskarte />
              </div>
            )}
            {/* Phase G Task 6: Speicher, Platte, Last und Verlauf des Servers. */}
            {panel('server', <AdminServer active={tab === 'server'} />)}
            {/* Phase 5 Task 5b: Protokoll der Admin-Ansicht (geöffnet aus "Familien"). */}
            {panel('protokoll', <AdminLog families={overview.families} />)}
          </>
        )}
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
