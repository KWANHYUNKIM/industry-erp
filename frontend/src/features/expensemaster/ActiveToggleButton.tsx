import { api, extractErrorMessage } from '../../api/client'
import { ecAlert } from '../../components/EcDialog'

/** 마스터 수정 창의 [사용중단/재사용](원본 E060808~E060810 수정 창) — 확인 창 없이 지금 값을 뒤집고 목록을 다시 읽는다. */
export default function ActiveToggleButton({ base, id, active, onToggled }: {
  base: string; id: number; active: boolean; onToggled: (active: boolean) => void
}) {
  async function toggle() {
    try {
      await api.post(`${base}/active?active=${!active}`, [id])
      onToggled(!active)
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }
  return <button type="button" className="ec-btn" onClick={() => void toggle()}>사용중단/재사용</button>
}
