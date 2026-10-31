import { Fragment, useState, type ReactNode } from 'react'
import { ModalWindow } from './Modal'
import WindowTools from './WindowTools'

/**
 * 조회 화면의 [신규(F2)] · 일자-No. 가 띄우는 입력 창 — 판매 · 구매 · 견적 · 주문 · 출하 · 생산 · 기초등록이 같이 쓴다.
 *
 * <p>원본(2026-10-31 loginad 실측)은 다른 화면으로 옮기지 않고 <b>목록 위에 떠 있는 창</b>을 띄운다 —
 * 제목줄 오른쪽에 [새창] [고정] [새로고침] [최대화] [닫기] 다섯. 바깥을 눌러도 안 닫힌다, [닫기] · ✕ 로만.
 * (2026-10-31 까지 pages/production/ProductionSlipWindow 였다 — 생산 전용이 아니라 components 로 옮겼다.)
 *
 * <ul>
 *   <li>[새창] — 같은 입력 화면을 새 브라우저 창으로 연다.</li>
 *   <li>[새로고침] — 창 안을 처음부터 다시 그린다(입력하던 것은 지워진다).</li>
 *   <li>[고정] — 원본은 창을 띄운 채 다른 메뉴로 옮겨도 남긴다. 이 창은 목록 화면에 딸려 있어 눌림 모양만 바꾼다.</li>
 * </ul>
 */
export default function SlipWindow({ title, popout, onClose, children }: {
  title: string
  /** [새창] 으로 열 입력 화면 주소 */
  popout: string
  onClose: () => void
  children: ReactNode
}) {
  const [pinned, setPinned] = useState(false)
  const [gen, setGen] = useState(0)
  const tools = <WindowTools popout={popout} pinned={pinned} onPin={() => setPinned((p) => !p)} onRefresh={() => setGen((g) => g + 1)} />
  return (
    <div className="ec-modal-back">
      <ModalWindow title={title} onClose={onClose} tools={tools} className="w-[max(960px,50vw)]">
        <Fragment key={gen}>{children}</Fragment>
      </ModalWindow>
    </div>
  )
}
