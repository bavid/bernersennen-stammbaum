import { useState } from 'react'
import { api } from '../../api'
import Icon from '../Icon.jsx'
import { useToast } from '../Toast.jsx'
import { Button } from '../ui/index.js'
import { useIsDemo } from '../../lib/demo.js'
import { useT } from '../../lib/i18n/index.js'

// Folgen/Entfolgen eines öffentlichen Profils (POST/DELETE /api/revier/p/:slug/folgen). In der Demo nur ansehen.
export default function FolgenKnopf({ slug, folgeIch, onChange, size = 'sm' }) {
  const t = useT()
  const toast = useToast()
  const readOnly = useIsDemo()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      if (folgeIch) await api.revier.entfolgen(slug)
      else await api.revier.folgen(slug)
      onChange?.(!folgeIch)
    } catch (err) {
      toast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant={folgeIch ? 'ghost' : 'primary'}
      size={size}
      disabled={readOnly}
      aria-pressed={folgeIch}
      aria-busy={busy || undefined}
      onClick={toggle}
    >
      <Icon name={folgeIch ? 'check' : 'plus'} />
      {folgeIch ? t('Ich folge') : t('Folgen')}
    </Button>
  )
}
