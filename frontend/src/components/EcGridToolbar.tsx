import { useState, type ReactNode, type RefObject } from 'react'
import GridFindButton from './codepicker/GridFindButton'
import Modal from './Modal'
import { DocPullButton, DocPullModal, PULLS, type PullKind, type PulledLine } from '../features/quality/DocPull'

/**
 * 원본 [전표불러오기] '메뉴검색' 창의 줄(2026-10-30 자가사용입력 E040503 실측 — 구분 · 메뉴 26줄).
 * 우리에게 불러올 길이 있는 메뉴(PULLS)는 누르면 그 '<종류>검색창(조회)' 이 뜬다. 나머지는 줄만 둔다.
 */
const SLIP_MENUS: [string, string, PullKind | null][] = [
  ['영업관리', '견적서', null], ['영업관리', '주문서', '주문'], ['영업관리', '판매', '판매'], ['영업관리', '출하지시서', null],
  ['영업관리', '출하', null], ['구매관리', '발주요청', null], ['구매관리', '발주계획', null], ['구매관리', '단가요청서', null],
  ['구매관리', '발주서', '발주'], ['구매관리', '구매', '구매'], ['생산/외주', '작업지시서', '작업지시서'], ['생산/외주', '생산불출', null],
  ['생산/외주', '생산입고', '생산'], ['기타이동', '창고이동', '이동'], ['기타이동', '불량처리', null], ['A/S관리', 'A/S접수', 'A/S접수'],
  ['A/S관리', 'A/S수리', null], ['품질관리', '품질검사요청', null], ['품질관리', '품질검사', null], ['수출관리', 'Invoice / Packing List', null],
  ['창고관리', '입고예정', null], ['창고관리', '출고예정', null], ['창고관리', 'ERP전표생성(입고)', null], ['창고관리', 'ERP전표생성(출고)', null],
]

/**
 * 원본 입력 격자 위 도구줄 — 재고 I 기타이동 입력 화면(자가사용 · 불량처리 · 창고이동 · 단계별재고실사)이 같이 쓴다(2026-10-21 loginaa 실측).
 *
 * <p>원본 차례: [찾기(F3)] · [정렬] · [My품목] · (화면마다 다른 전표 종류: 자가사용 주문 · 구매 / 불량처리 판매 · 구매 · 생산 · 이동) ·
 * [재고불러오기] · [바코드] · [전표 바코드] · [검증] · [전표불러오기]. [찾기(F3)] 는 격자를 찾아 가고 [My품목] 은 {@link onMyItems} 가 있으면 붓는다.
 * [정렬] 은 {@link onSort}, 전표 종류 단추 · [전표불러오기] 는 {@link onPull} 이 있으면 원본 검색창을 띄운다(2026-10-30 클릭 대조).
 * 재고불러오기 · 바코드 · 전표 바코드 · 검증은 원본처럼 모양만 둔다(우리에겐 아직 없다 — 눌러도 아무 일 없음).
 *
 * <p>단추 이름은 <b>이 파일에 글자로</b> 적는다(화면이 배열로 넘기면 버튼 검사가 못 본다 — MyItemsButton 주석 참고).
 */
export default function EcGridToolbar({ tableRef, slipKinds = [], onMyItems, myItemsBusy, onSort, onPull, children }: {
  tableRef: RefObject<HTMLTableElement | null>
  /** 원본 화면마다 다른 전표 종류 단추(자가사용: 주문 · 구매, 불량처리: 판매 · 구매 · 생산 · 이동). */
  slipKinds?: string[]
  onMyItems?: () => void
  myItemsBusy?: boolean
  /** [정렬] — 화면이 '정렬기준' 창(GridSortModal)을 연다(원본 품목코드 · 품목명 · 규격). */
  onSort?: () => void
  /** 전표 종류 단추 · [전표불러오기] 로 고른 전표의 줄을 받는다(원본: 그 전표의 품목 · 수량이 줄로 들어온다). */
  onPull?: (lines: PulledLine[]) => void
  children?: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pullKind, setPullKind] = useState<PullKind | null>(null)
  return (
    <div className="ec-toolbar mb-[4px]">
      <GridFindButton tableRef={tableRef} />
      <button type="button" className="ec-btn ec-btn-sm" onClick={onSort}>정렬</button>
      <button type="button" className="ec-btn ec-btn-sm" disabled={myItemsBusy} onClick={onMyItems}>My품목</button>
      {slipKinds.map((k) => onPull && k in PULLS
        ? <DocPullButton key={k} kind={k as PullKind} onApply={onPull} />
        : <button key={k} type="button" className="ec-btn ec-btn-sm">{k}</button>)}
      <button type="button" className="ec-btn ec-btn-sm">재고불러오기</button>
      <button type="button" className="ec-btn ec-btn-sm">바코드</button>
      <button type="button" className="ec-btn ec-btn-sm">전표 바코드</button>
      <button type="button" className="ec-btn ec-btn-sm">검증</button>
      <button type="button" className="ec-btn ec-btn-sm" onClick={onPull ? () => setMenuOpen(true) : undefined}>전표불러오기</button>
      {children}
      <Modal open={menuOpen} title="메뉴검색" width={420} onClose={() => setMenuOpen(false)}>
        <table className="w-full">
          <thead><tr><th className="w-[120px]">구분</th><th>메뉴</th></tr></thead>
          <tbody>
            {SLIP_MENUS.map(([g, m, kind]) => (
              <tr key={m}>
                <td>{g}</td>
                <td>{kind
                  ? <a href="#" onClick={(e) => { e.preventDefault(); setMenuOpen(false); setPullKind(kind) }}>{m}</a>
                  : m}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[9px]">
          <button type="button" className="ec-btn" onClick={() => setMenuOpen(false)}>닫기</button>
        </div>
      </Modal>
      {pullKind && onPull && <DocPullModal kind={pullKind} onApply={onPull} onClose={() => setPullKind(null)} />}
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
