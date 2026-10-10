import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { useToast } from '../Toast.jsx'
import { t } from '../../lib/i18n/index.js'

// Zustand der eigenen Codes im Einladen-Dialog (Phase V2b): die noch nicht eingelösten (vouchers), das Archiv der
// eingelösten (archive) und - wo man neue anlegen darf (withLimit) - die Obergrenze offener Codes (limit).
// Die Aktionen schreiben sofort und melden Fehler als Toast; setLabel wirft den Fehler weiter, damit das Feld offen
// bleibt.
export default function useVoucherList({ withLimit }) {
  const toast = useToast()
  const [vouchers, setVouchers] = useState(undefined)
  const [archive, setArchive] = useState(null)
  const [limit, setLimit] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)

  const loadLimit = useCallback(() => {
    if (!withLimit) return
    api
      .voucherLimit()
      .then(setLimit)
      .catch(() => setLimit(null))
  }, [withLimit])

  const reload = useCallback(() => {
    api
      .myVouchers()
      .then(setVouchers)
      .catch((err) => setError(err.message))
    loadLimit()
  }, [loadLimit])

  useEffect(() => {
    reload()
    api
      .myVouchers({ archiv: true })
      .then(setArchive)
      .catch(() => setArchive([]))
  }, [reload])

  const replaceIn = (list, id, patch) => list?.map((voucher) => (voucher.id === id ? { ...voucher, ...patch } : voucher))

  async function create() {
    setCreating(true)
    try {
      const created = await api.createVoucher()
      setVouchers((list) => [created, ...(list || [])])
      loadLimit()
      toast(t('Neuer Code erstellt'))
    } catch (err) {
      toast(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function remove(voucher) {
    try {
      await api.deleteVoucher(voucher.id)
      setVouchers((list) => list.filter((v) => v.id !== voucher.id))
      loadLimit()
      toast(voucher.status === 'offen' ? t('Code zurückgezogen') : t('Code gelöscht'))
    } catch (err) {
      toast(err.message)
    }
  }

  async function setLabel(voucher, label) {
    try {
      const result = await api.setVoucherLabel(voucher.id, label)
      setVouchers((list) => replaceIn(list, voucher.id, { label: result.label }))
      setArchive((list) => replaceIn(list, voucher.id, { label: result.label }))
    } catch (err) {
      toast(err.message)
      throw err
    }
  }

  async function setRole(voucher, rolle) {
    const previous = voucher.rolle
    setVouchers((list) => replaceIn(list, voucher.id, { rolle }))
    try {
      await api.setVoucherRole(voucher.id, rolle)
    } catch (err) {
      setVouchers((list) => replaceIn(list, voucher.id, { rolle: previous }))
      toast(err.message)
    }
  }

  return { vouchers, archive, limit, error, creating, reload, create, remove, setLabel, setRole }
}
