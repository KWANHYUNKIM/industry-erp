import { Fragment, useState, type ReactNode } from 'react'
import { ModalWindow } from '../../components/Modal'
import { Icon } from '../../features/appbar/icons'

/**
 * 생산 조회 화면(작업지시서조회 · 생산입고조회)의 [신규(F2)] · [생산입고I] · 일자-No. 가 띄우는 입력 창.
 *
 * <p>원본(2026-10-31 loginad 실측)은 다른 화면으로 옮기지 않고 <b>목록 위에 떠 있는 창</b>을 띄운다 —
 * 제목줄 오른쪽에 [새창] [고정] [새로고침] [최대화] [닫기] 다섯. 판매조회의 판매입력 창과 같은 틀이다
 * (pages/trade/TradeInquiryPage — 바깥을 눌러도 안 닫힌다, [닫기] · ✕ 로만).
 *
 * <ul>
 *   <li>[새창] — 같은 입력 화면을 새 브라우저 창으로 연다.</li>
 *   <li>[새로고침] — 창 안을 처음부터 다시 그린다(입력하던 것은 지워진다).</li>
 *   <li>[고정] — 원본은 창을 띄운 채 다른 메뉴로 옮겨도 남긴다. 이 창은 목록 화면에 딸려 있어 눌림 모양만 바꾼다.</li>
 * </ul>
 */
export default function ProductionSlipWindow({ title, popout, onClose, children }: {
  title: string
  /** [새창] 으로 열 입력 화면 주소 */
  popout: string
  onClose: () => void
  children: ReactNode
}) {
  const [pinned, setPinned] = useState(false)
  const [gen, setGen] = useState(0)
  const tools = (
    <>
      <button type="button" className="tool" title="새창" aria-label="새창"
              onClick={() => window.open(popout, '_blank', 'noopener,noreferrer')}><Icon name="popout" /></button>
      <button type="button" className={`tool${pinned ? ' on' : ''}`} title={pinned ? '고정 풀기' : '고정'} aria-label="고정"
              aria-pressed={pinned} onClick={() => setPinned((p) => !p)}><Icon name="pin" /></button>
      <button type="button" className="tool" title="새로고침" aria-label="새로고침" onClick={() => setGen((g) => g + 1)}><Icon name="refresh" /></button>
    </>
  )
  return (
    <div className="ec-modal-back">
      <ModalWindow title={title} onClose={onClose} tools={tools} className="w-[max(960px,50vw)]">
        <Fragment key={gen}>{children}</Fragment>
      </ModalWindow>
    </div>
  )
}
