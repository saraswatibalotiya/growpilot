import { useT } from '../../i18n'
import { STATUS_LABEL } from '../../lib/reels'
import type { ReelStatus } from '../../services/reels'

export function ReelStatusBadge({ status }: { status: ReelStatus }) {
  const t = useT()
  const s = STATUS_LABEL[status]
  return <span className={`badge badge-${s.tone}`}>{t(`reels.status.${status}`)}</span>
}
