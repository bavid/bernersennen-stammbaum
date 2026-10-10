import TabBar from './TabBar.jsx'
import { t } from '../lib/i18n/index.js'
import { adminPanelId, adminSubPanelId, openCountText } from '../lib/adminTabs.js'

// Ein Hauptreiter im Admin (Plan 2026-10-10-admin-5-reiter): sein Panel trägt eine zweite, leisere Reiter-Leiste mit den
// Unterreitern, darunter je Unterreiter ein Panel - ein Thema je Seite. Panels sind immer im DOM (Ziel von
// aria-controls), ihr Inhalt erst, sobald isMounted(Unterreiter) gilt (einmal geöffnet oder immer eingehängt).
// bereich: der gewählte (oder hier zuletzt offene) Unterreiter.
export default function AdminSection({ section, active, bereich, cards, counts, isMounted, onSelect }) {
  const subs = section.subs.map((item) => ({ key: item.key, label: t(item.label) }))

  return (
    <div
      id={adminPanelId(section.key)}
      role="tabpanel"
      aria-labelledby={`admin-tab-${section.key}`}
      className="admin-panel admin-section"
      hidden={!active}
    >
      <TabBar
        tabs={subs}
        current={bereich}
        counts={counts}
        label={t(section.label)}
        idPrefix="admin-sub"
        panelId={adminSubPanelId}
        countText={openCountText}
        className="admin-subtabs"
        onSelect={(key) => onSelect(section.key, key)}
      />
      {section.subs.map((item) => (
        <div
          key={item.key}
          id={adminSubPanelId(item.key)}
          role="tabpanel"
          aria-labelledby={`admin-sub-${item.key}`}
          className="admin-subpanel"
          hidden={!active || bereich !== item.key}
        >
          {isMounted(item.key) && cards[item.key]}
        </div>
      ))}
    </div>
  )
}
