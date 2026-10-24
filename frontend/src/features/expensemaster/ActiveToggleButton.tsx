import { api, extractErrorMessage } from '../../api/client'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EditStateMenu, { type StateOp } from '../../components/EditStateMenu'

/**
 * 마스터 수정 창의 [사용중단/재사용 ▲](원본 비용등록 E060809 수정 창, 2026-10-22 실측) — 다른 관리 마스터와 같은 공용 펼침(EditStateMenu):
 * 쓰는 중이면 사용중단 · 삭제, 중단이면 재사용 · 삭제. 사용중단 · 재사용은 확인 창 없이 값을 뒤집고 목록을 다시 읽는다, 삭제는 '삭제하겠습니까?' [확인] 뒤.
 */
export default function ActiveToggleButton({ base, id, active, onToggled, onDeleted }: {
  base: string; id: number; active: boolean; onToggled: (active: boolean) => void; onDeleted?: () => void
}) {
  async function pick(op: StateOp) {
    try {
      if (op === '삭제') {
        if (!(await ecConfirm('삭제하겠습니까?'))) return
        await api.post(`${base}/delete`, [id])
        onDeleted?.()
      } else {
        await api.post(`${base}/active?active=${op === '재사용'}`, [id])
        onToggled(op === '재사용')
      }
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }
  return <EditStateMenu active={active} onPick={(op) => void pick(op)} />
}
