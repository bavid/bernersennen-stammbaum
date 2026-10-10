import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import { Button, Card, Chip, EmptyState, SectionHeader, Tile } from '../components/ui/index.js'
import { BUTTON_SIZES, BUTTON_VARIANTS } from '../components/ui/Button.jsx'
import { CARD_PADS, CARD_VARIANTS } from '../components/ui/Card.jsx'
import { CHIP_TONES } from '../components/ui/Chip.jsx'
import { t } from '../lib/i18n/index.js'

// Box-System Welle 1: lebender Katalog der Bausteine aus components/ui unter /admin/bausteine (eigener Chunk aus App.jsx).
// Zeigt jeden Baustein in jeder Variante mit den echten Klassen - wer Farbwelt, Ecken oder Hell/Dunkel in den
// Einstellungen ändert, sieht hier sofort, wie alles mitzieht. Nur mit Admin-Sitzung, sonst zurück zu /admin.

const CARD_LABELS = {
  flat: 'Flach – Rand ohne Schatten',
  raised: 'Gehoben – die Album-Karte',
  tinted: 'Getönt – für Hinweise',
  interactive: 'Interaktiv – hebt sich beim Zeigen'
}
const PAD_LABELS = { sm: 'Klein', md: 'Mittel', lg: 'Groß' }
const CHIP_LABELS = { neutral: 'Entwurf', ok: 'Freigegeben', wartet: 'Wartet', gesperrt: 'Gesperrt', neu: 'Neu', anzeige: 'Anzeige' }
const CHIP_ICONS = { ok: 'check', wartet: 'clock', gesperrt: 'lock', neu: 'star', anzeige: 'megaphone' }
const BUTTON_LABELS = { primary: 'Speichern', ghost: 'Abbrechen', ink: 'Weiter', danger: 'Löschen' }
const SIZE_LABELS = { sm: 'klein', md: 'normal', lg: 'groß' }

function Specimen({ name, children }) {
  return (
    <div className="bausteine-specimen">
      <code className="bausteine-name">{name}</code>
      {children}
    </div>
  )
}

function CardSection() {
  return (
    <Card as="section" pad="lg" aria-labelledby="bs-card">
      <SectionHeader id="bs-card" title="Card" description={t('Eine Fläche für zusammengehörige Inhalte. Vier Arten, drei Innenabstände.')} />
      <div className="bausteine-grid">
        {CARD_VARIANTS.map((variant) => (
          <Specimen key={variant} name={`variant="${variant}"`}>
            <Card variant={variant}>
              <strong>{t(CARD_LABELS[variant])}</strong>
              {variant === 'interactive' && (
                <p>
                  <a href="#bs-card">{t('Mehr erfahren')}</a>
                </p>
              )}
            </Card>
          </Specimen>
        ))}
        {CARD_PADS.map((pad) => (
          <Specimen key={pad} name={`pad="${pad}"`}>
            <Card variant="flat" pad={pad}>
              {t(PAD_LABELS[pad])}
            </Card>
          </Specimen>
        ))}
      </div>
    </Card>
  )
}

function TileSection() {
  return (
    <Card as="section" pad="lg" aria-labelledby="bs-tile">
      <SectionHeader id="bs-tile" title="Tile" description={t('Bild mit Unterschrift. Ohne Bild steht der erste Buchstabe.')} />
      <ul className="bausteine-tiles" role="list">
        <li>
          <Specimen name='shape="square"'>
            <Tile title="Benno" sub={t('3 Jahre')} />
          </Specimen>
        </li>
        <li>
          <Specimen name='shape="wide"'>
            <Tile shape="wide" title="Luna" sub={t('Im Garten')} />
          </Specimen>
        </li>
        <li>
          <Specimen name='href="…"'>
            <Tile href="#bs-tile" title="Momo" sub={t('Als Link')} />
          </Specimen>
        </li>
      </ul>
    </Card>
  )
}

function ChipSection() {
  return (
    <Card as="section" pad="lg" aria-labelledby="bs-chip">
      <SectionHeader id="bs-chip" title="Chip" description={t('Kleiner Stand. Die Farbe hilft, der Text sagt es immer mit.')} />
      <div className="bausteine-row">
        {CHIP_TONES.map((tone) => (
          <Specimen key={tone} name={`tone="${tone}"`}>
            <Chip tone={tone} icon={CHIP_ICONS[tone]}>
              {t(CHIP_LABELS[tone])}
            </Chip>
          </Specimen>
        ))}
      </div>
    </Card>
  )
}

function ButtonSection() {
  return (
    <Card as="section" pad="lg" aria-labelledby="bs-button">
      <SectionHeader id="bs-button" title="Button" description={t('Knöpfe mit den vorhandenen Stilen. Mit href wird ein Link daraus.')} />
      <div className="bausteine-row">
        {BUTTON_VARIANTS.map((variant) => (
          <Specimen key={variant} name={`variant="${variant}"`}>
            <Button variant={variant}>{t(BUTTON_LABELS[variant])}</Button>
          </Specimen>
        ))}
      </div>
      <div className="bausteine-row">
        {BUTTON_SIZES.map((size) => (
          <Specimen key={size} name={`size="${size}"`}>
            <Button variant="ghost" size={size}>
              {t(SIZE_LABELS[size])}
            </Button>
          </Specimen>
        ))}
        <Specimen name="disabled">
          <Button disabled>{t('Speichern')}</Button>
        </Specimen>
      </div>
    </Card>
  )
}

function HeaderAndEmptySection() {
  const action = (
    <Button variant="ghost" size="sm">
      <Icon name="plus" /> {t('Neu')}
    </Button>
  )
  return (
    <Card as="section" pad="lg" aria-labelledby="bs-section">
      <SectionHeader id="bs-section" title="SectionHeader & EmptyState" />
      <Specimen name="<SectionHeader title description action />">
        <SectionHeader level={3} title={t('Fotos')} description={t('Die schönsten Bilder eurer Tiere.')} action={action} />
      </Specimen>
      <Specimen name="<EmptyState icon title action />">
        <EmptyState icon="image" title={t('Noch keine Fotos')} action={<Button size="sm">{t('Foto hinzufügen')}</Button>}>
          {t('Ladet das erste Bild hoch – es erscheint dann hier.')}
        </EmptyState>
      </Specimen>
    </Card>
  )
}

export default function AdminBausteinePage() {
  const [admin, setAdmin] = useState(undefined)

  useEffect(() => {
    api.admin
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null))
  }, [])

  if (admin === undefined) return <div className="splash" aria-busy="true" />
  if (!admin) return <Navigate to="/admin" replace />

  return (
    <main className="bausteine-page">
      <header className="bausteine-head">
        <span className="eyebrow">{t('Box-System')}</span>
        <h1>{t('Bausteine')}</h1>
        <p className="muted">{t('Alle Bausteine in allen Varianten – so sehen Karten, Kacheln, Chips und Knöpfe überall in der App aus.')}</p>
        <Button as={Link} to="/admin" variant="ghost">
          <Icon name="arrowLeft" /> {t('Zurück zum Admin')}
        </Button>
      </header>
      <CardSection />
      <TileSection />
      <ChipSection />
      <ButtonSection />
      <HeaderAndEmptySection />
    </main>
  )
}
