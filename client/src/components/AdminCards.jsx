import AdminOverview from './AdminOverview.jsx'
import AdminKpi from './AdminKpi.jsx'
import AdminStats from './AdminStats.jsx'
import AdminFamilyList from './AdminFamilyList.jsx'
import AdminMessages from './AdminMessages.jsx'
import AdminVouchers from './AdminVouchers.jsx'
import AdminPartners from './AdminPartners.jsx'
import AdminPromotions from './AdminPromotions.jsx'
import AdminCommunityBanner from './AdminCommunityBanner.jsx'
import AdminPostApproval from './AdminPostApproval.jsx'
import AdminSupport from './AdminSupport.jsx'
import AdminSpenden from './AdminSpenden.jsx'
import AdminLog from './AdminLog.jsx'
import AdminAnfragen from './AdminAnfragen.jsx'
import AdminNotify from './AdminNotify.jsx'
import AdminEinladungskarte from './AdminEinladungskarte.jsx'
import AdminHinweise from './AdminHinweise.jsx'
import AdminServer from './AdminServer.jsx'
import AdminFinanzierung from './AdminFinanzierung.jsx'
import AdminLandeadressen from './AdminLandeadressen.jsx'
import AdminRevier from './AdminRevier.jsx'

// Gültiges Ziel für einen Partner-Gutscheinstapel (siehe routes/admin.js POST /voucher-batches)
function partnerVoucherEligible(partner) {
  return partner.status === 'entwurf' || partner.status === 'aktiv'
}

// An einen Partner gebundener Partner-Zugang (Phase P): nur ein echter Partner (keine Demo) ohne eigenen
// Bereich (server/lib/partnerAccess.js findBindablePartner).
function partnerAccessBindable(partner) {
  return !partner.is_demo && !partner.area_family_id
}

// Die Karte je Unterreiter (Schlüssel aus lib/adminTabs.js ADMIN_SECTIONS). Die Karten selbst sind unverändert.
// ctx: overview, partners, todo, bereich (gewählter Unterreiter), promotions (version/bump), Rückmelder der Zähler.
export function adminCards({ overview, partners, todo, bereich, promotions, onOpenTab, setPartners, report }) {
  const { version, bump } = promotions
  return {
    ueberblick: <AdminOverview stats={overview.stats} todo={todo} onOpenTab={onOpenTab} />,
    erfolg: <AdminKpi />,
    familien: <AdminFamilyList families={overview.families} />,
    partner: <AdminPartners onChange={setPartners} />,
    // Phase N: Anfragen (Gutschein, Partner-Zugang) - die Telegram-Benachrichtigungen dazu unter System.
    anfragen: <AdminAnfragen onCountChange={report.requests} />,
    gutscheine: (
      <AdminVouchers
        joinableFamilies={overview.families.filter((family) => family.art === 'rudel' && !family.is_demo)}
        partners={partners.filter(partnerVoucherEligible)}
        accessPartners={partners.filter(partnerAccessBindable)}
      />
    ),
    // Einladungskarten: die Rückseite, die Familie auf Pfoten auf jede Karte der Partner druckt.
    einladungskarte: <AdminEinladungskarte />,
    // Phase P2: eingereichte Beiträge der Partner - dieselben Zeilen wie „Empfehlungen“ (version/bump).
    freigaben: <AdminPostApproval version={version} onChanged={bump} onCountChange={report.posts} />,
    nachrichten: <AdminMessages onCountChange={report.messages} />,
    hinweise: <AdminHinweise />,
    // Phase M „Mein Revier“: öffentliche Profile ausschalten (Not-Aus).
    revier: <AdminRevier />,
    empfehlungen: <AdminPromotions partners={partners} version={version} onChanged={bump} />,
    band: <AdminCommunityBanner />,
    // Plan 2027 Kap. 6: eigene Landeadresse je Kanal (/fb, /anzeige-herbst) - anonym gezählt.
    landeadressen: <AdminLandeadressen />,
    statistik: <AdminStats teil="details" />,
    // „Spenden live“: zuerst eingegangene Spenden erfassen, darunter Spenden-Knopf und Transparenzberichte.
    spenden: (
      <>
        <AdminSpenden />
        <AdminSupport />
      </>
    ),
    finanzierung: <AdminFinanzierung />,
    // Phase G Task 6: Speicher, Platte, Last und Verlauf - fragt nur nach, solange der Unterreiter offen ist.
    server: <AdminServer active={bereich === 'server'} />,
    benachrichtigungen: <AdminNotify />,
    protokoll: <AdminLog families={overview.families} />
  }
}
