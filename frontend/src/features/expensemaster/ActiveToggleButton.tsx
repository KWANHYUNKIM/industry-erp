import { useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/**
 * 마스터 수정 창의 [사용중단/재사용 ▴](원본 비용등록 E060809 수정 창, 2026-10-22 실측) — 글자를 눌러도 위로 펴지는 메뉴다:
 * 쓰는 중이면 [사용중단] · [삭제], 중단된 자료면 [재사용] · [삭제](재사용 글자는 중단된 자료 쪽 짐작). 사용중단 · 재사용은 확인 창 없이 값을
 * 뒤집고 목록을 다시 읽는다, 삭제는 '삭제하겠습니까?' [확인] 뒤.
 */
export default function ActiveToggleButton({ base, id, active, onToggled, onDeleted }: {
  base: string; id: number; active: boolean; onToggled: (active: boolean) => void; onDeleted?: () => void
}) {
  const [open, setOpen] = useState(false)
  async function toggle() {
    setOpen(false)
    try {
      await api.post(`${base}/active?active=${!active}`, [id])
      onToggled(!active)
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }
  async function remove() {
    setOpen(false)
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.post(`${base}/delete`, [id])
      onDeleted?.()
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }
  const item = 'no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer'
  return (
    <span className="ec-btn-group relative">
      <button type="button" className="ec-btn" onClick={() => setOpen((v) => !v)}>사용중단/재사용 ▴</button>
      {open && (
        <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[110px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
          <button type="button" className={item} onClick={() => void toggle()}>{active ? '사용중단' : '재사용'}</button>
          {onDeleted && <button type="button" className={item} onClick={() => void remove()}>삭제</button>}
        </div>
      )}
    </span>
  )
}
