import { useMemo } from 'react'
import FamilyGroupCard from './FamilyGroupCard.jsx'
import FriendHomesCard from './FriendHomesCard.jsx'
import MembershipCard from './MembershipCard.jsx'
import { collectNodes } from '../../lib/pedigree.js'

// Familienbande im Standard-Auftritt (Phase V3): Abschnitte statt Generationen - der eigene Bereich (in einer Familie
// die Familie selbst) zuerst, dann die Zuhause der Mitglieder, die Familien des eigenen Zuhauses und die befreundeten
// Zuhause. groups: lib/familyGroups.js buildFamilyGroups. Keine Linien; Beziehungen stehen als Chips an den Karten
// (über alle Abschnitte hinweg, auch zu Eltern aus anderen Bereichen). onOpenArea(id, name): hooks/useOpenArea.js.
export default function FamiliesView({ groups, dogs, allDogs, links, onOpenArea }) {
  const nodes = useMemo(() => collectNodes(dogs, allDogs), [dogs, allDogs])
  return (
    <div className="families-view">
      {groups.owners.map((group) => (
        <FamilyGroupCard key={group.key} group={group} nodes={nodes} links={links} hideOrigin={group.key !== 'eigen'} />
      ))}
      {groups.memberships.map((group) => (
        <MembershipCard key={group.key} group={group} onOpen={onOpenArea} />
      ))}
      {groups.friends.length > 0 && <FriendHomesCard homes={groups.friends} onVisit={onOpenArea} />}
    </div>
  )
}
