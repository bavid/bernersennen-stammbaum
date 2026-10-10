import Icon from '../Icon.jsx'
import { Card } from '../ui/index.js'
import { useT } from '../../lib/i18n/index.js'

// Die vier Wörter der Sichtbarkeit in einfachem Deutsch - einmal oben, statt an jeder Stelle neu erklärt.
const WOERTER = [
  { icon: 'lock', key: 'Privat', text: 'nur ihr – die Menschen in eurem Zuhause.' },
  { icon: 'users', key: 'Familie', text: 'alle in dieser Familie sehen das Tier und seine nicht privaten Erinnerungen.' },
  { icon: 'eye', key: 'Gast', text: 'sieht eure Tiere und nicht private Erinnerungen – nur lesen und Grüße schreiben.' },
  { icon: 'globe', key: 'Öffentlich', text: 'nur, was ihr selbst öffentlich schaltet – euer Profil in „Mein Revier“ (nur für angemeldete Tierhalter) oder ein Steckbrief-Link.' }
]

export default function SichtbarkeitLegende() {
  const t = useT()
  return (
    <Card as="section" variant="tinted" pad="sm" className="sicht-legende" aria-labelledby="sicht-legende-title">
      <h2 id="sicht-legende-title" className="sicht-legende-title">
        {t('Wer sieht was')}
      </h2>
      <dl className="sicht-legende-list">
        {WOERTER.map((wort) => (
          <div key={wort.key} className="sicht-legende-item">
            <dt>
              <Icon name={wort.icon} />
              {t(wort.key)}
            </dt>
            <dd>{t(wort.text)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
