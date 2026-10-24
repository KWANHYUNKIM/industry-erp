import type { ReactNode, RefObject } from 'react'
import GridFindButton from './GridFindButton'

/**
 * 원본 입력 격자 위 도구줄 — 재고 I 기타이동 입력 화면(자가사용 · 불량처리 · 창고이동 · 단계별재고실사)이 같이 쓴다(2026-10-21 loginaa 실측).
 *
 * <p>원본 차례: [찾기(F3)] · [정렬] · [My품목] · (화면마다 다른 전표 종류: 자가사용 주문 · 구매 / 불량처리 판매 · 구매 · 생산 · 이동) ·
 * [재고불러오기] · [바코드] · [전표 바코드] · [검증] · [전표불러오기]. [찾기(F3)] 는 격자를 찾아 가고 [My품목] 은 {@link onMyItems} 가 있으면 붓는다.
 * 나머지는 원본처럼 모양만 둔다(바코드 · 전표 연동 · 검증 이 우리에겐 아직 없다 — 눌러도 아무 일 없음).
 *
 * <p>단추 이름은 <b>이 파일에 글자로</b> 적는다(화면이 배열로 넘기면 버튼 검사가 못 본다 — MyItemsButton 주석 참고).
 */
export default function EcGridToolbar({ tableRef, slipKinds = [], onMyItems, myItemsBusy, children }: {
  tableRef: RefObject<HTMLTableElement | null>
  /** 원본 화면마다 다른 전표 종류 단추(자가사용: 주문 · 구매, 불량처리: 판매 · 구매 · 생산 · 이동). */
  slipKinds?: string[]
  onMyItems?: () => void
  myItemsBusy?: boolean
  children?: ReactNode
}) {
  return (
    <div className="ec-toolbar mb-[4px]">
      <GridFindButton tableRef={tableRef} />
      <button type="button" className="ec-btn ec-btn-sm">정렬</button>
      <button type="button" className="ec-btn ec-btn-sm" disabled={myItemsBusy} onClick={onMyItems}>My품목</button>
      {slipKinds.map((k) => <button key={k} type="button" className="ec-btn ec-btn-sm">{k}</button>)}
      <button type="button" className="ec-btn ec-btn-sm">재고불러오기</button>
      <button type="button" className="ec-btn ec-btn-sm">바코드</button>
      <button type="button" className="ec-btn ec-btn-sm">전표 바코드</button>
      <button type="button" className="ec-btn ec-btn-sm">검증</button>
      <button type="button" className="ec-btn ec-btn-sm">전표불러오기</button>
      {children}
    </div>
  )
}

/** 격자 아래 [웹자료올리기] — 원본은 바깥 파일 올리기라 모양만. */
export function EcWebUploadButton() {
  return (
    <div className="mt-[6px]">
      <button type="button" className="ec-btn ec-btn-sm">웹자료올리기</button>
    </div>
  )
}
