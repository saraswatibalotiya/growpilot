import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { Button } from '../ui'

export function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-title" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel() }}>
      <h2 id="confirm-title">{title}</h2>
      <div className="confirm-body">{children}</div>
      <div className="confirm-actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
          {t('reels.common.notYet')}
        </Button>
        <Button onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
