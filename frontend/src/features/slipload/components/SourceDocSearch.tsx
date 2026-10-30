import type { ReactNode } from 'react'
import EcIcon from '../../../components/ui/EcIcon'

/**
 * 원본 '…검색창(조회)' — 다른 전표를 불러오는 창의 전표 단위 꼴(2026-10-28 loginaa 실측).
 * 판매입력 [주문] 의 '주문서검색창' 과 주문서입력 [견적] 의 '견적서검색창' 이 같은 꼴이라 한 부품으로 그린다:
 * 알약 · 머리 검색칸, 전표 단위 열 일자-No. · 거래처명 · 사원(담당)명 · 품목명(요약) · (납기일자|유효기간) · (주문|견적)금액합계 ·
 * 진행상태 · 생성한전표 · 인쇄, 아래 라인별 ▾ · 잔량적용(F8) · 전체적용 · 신규(F2) · 리스트 · 닫기.
 * 출하지시서입력 [판매] 의 '판매검색창' 은 열이 다르다(일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 거래유형명 · 창고명 ·
 * 회계반영여부 · 인쇄 · 불러온전표, 단추 라인별 · 적용(F8) · 신규(F2) · 리스트 · 닫기) — `columns` + 줄의 `cells` 로 그린다.
 * 자료를 모으고 담는 일은 부르는 화면이 한다 — 이 부품은 그리기만 한다.
 */
export interface SourceDocColumn { label: string; className?: string }
export interface SourceDocRow {
  key: number
  dateNo: string
  partnerName: string
  employeeName: string
  itemSummary: string
  /** 납기일자(주문) · 유효기간(견적) — 이미 '2026/10/28' 꼴로. */
  date2: string
  total: number
  statusLabel: string
  /** 다른 전표로 이어졌으면 [생성한전표] 가 주황. */
  created: boolean
  /** `columns` 를 줬을 때 체크칸 뒤에 그릴 칸들(그 차례대로). */
  cells?: ReactNode[]
}

interface Props<T extends string> {
  tabs: [T, string][]
  tab: T
  onTab: (t: T) => void
  query: string
  onQuery: (q: string) => void
  /** 다섯째 · 여섯째 열 이름 — '납기일자' · '주문금액합계' / '유효기간' · '견적금액합계'. */
  date2Label: string
  totalLabel: string
  docs: SourceDocRow[]
  picked: Record<number, boolean>
  onPicked: (p: Record<number, boolean>) => void
  /** [생성한전표] 단추 말풍선 — 그 창은 조회 화면에서 연다. */
  createdTitle: string
  byLine: boolean
  onToggleByLine: () => void
  /** [라인별] 을 켰을 때 표 대신 그릴 줄 단위 표. */
  lineView: ReactNode
  onApply: () => void
  /** 기본 '잔량적용(F8)' — 판매검색창은 '적용(F8)'. */
  applyLabel?: string
  /** 없으면 [전체적용] 을 안 그린다(판매검색창). */
  applyAllTitle?: string
  /** 기본 열 대신 그릴 열 — 줄은 `cells` 로. */
  columns?: SourceDocColumn[]
  onNew: () => void
  onList: () => void
  onClose: () => void
}

const won = (n: number) => n.toLocaleString('ko-KR')

export default function SourceDocSearch<T extends string>(p: Props<T>) {
  const allPicked = p.docs.length > 0 && p.docs.every((d) => p.picked[d.key])
  return (
    <>
      <div className="flex items-center gap-[10px] mb-[6px]">
        <div className="ec-pills">
          {p.tabs.map(([k, label]) => (
            <button key={k} type="button" className={`ec-pill no-ec${p.tab === k ? ' active' : ''}`} onClick={() => p.onTab(k)}>{label}</button>
          ))}
        </div>
        <input className="ec-input ml-auto w-[220px]" placeholder="검색어 찾기"
               value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
      </div>
      {p.byLine ? p.lineView : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[30px] text-center">
                  <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                         onChange={(e) => p.onPicked(e.target.checked ? Object.fromEntries(p.docs.map((d) => [d.key, true])) : {})} />
                </th>
                {p.columns ? p.columns.map((c) => <th key={c.label} className={c.className}>{c.label}</th>) : (<>
                <th>일자-No.</th>
                <th>거래처명</th>
                <th>사원(담당)명</th>
                <th>품목명(요약)</th>
                <th>{p.date2Label}</th>
                <th className="text-right">{p.totalLabel}</th>
                <th className="text-center">진행상태</th>
                <th className="text-center">생성한전표</th>
                <th className="text-center">인쇄</th>
                </>)}
              </tr>
            </thead>
            <tbody>
              {p.docs.length === 0 ? (
                <tr><td colSpan={p.columns ? p.columns.length + 1 : 10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : p.docs.map((d) => (
                <tr key={d.key}>
                  <td className="text-center">
                    <input type="checkbox" aria-label="선택" checked={!!p.picked[d.key]}
                           onChange={(e) => p.onPicked({ ...p.picked, [d.key]: e.target.checked })} />
                  </td>
                  {p.columns ? p.columns.map((c, i) => <td key={c.label} className={c.className}>{d.cells?.[i]}</td>) : (<>
                  <td>{d.dateNo}</td>
                  <td>{d.partnerName}</td>
                  <td>{d.employeeName}</td>
                  <td>{d.itemSummary}</td>
                  <td>{d.date2}</td>
                  <td className="text-right">{won(d.total)}</td>
                  <td className="text-center text-ec-navy">{d.statusLabel}</td>
                  {/* 원본은 다른 전표로 이어진 것만 [생성한전표] 가 주황이다. */}
                  <td className="text-center">
                    <span className={`ec-btn ec-btn-sm${d.created ? ' bg-[var(--ec-bg-tag)] border-[var(--ec-bg-tag)] text-ec-panel' : ''}`}
                          title={p.createdTitle}>조회</span>
                  </td>
                  <td className="text-center text-ec-hint">인쇄</td>
                  </>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-[4px] mt-[9px]">
        <button type="button" className={`ec-btn${p.byLine ? ' ec-btn-primary' : ''}`} onClick={p.onToggleByLine}>라인별 <EcIcon name="caret-down" size={10} glyph="▾" /></button>
        <button type="button" className="ec-btn ec-btn-primary" onClick={p.onApply}>{p.applyLabel ?? '잔량적용(F8)'}</button>
        {p.applyAllTitle != null && <button type="button" className="ec-btn" disabled title={p.applyAllTitle}>전체적용</button>}
        <button type="button" className="ec-btn" onClick={p.onNew}>신규(F2)</button>
        <button type="button" className="ec-btn" onClick={p.onList}>리스트</button>
        <button type="button" className="ec-btn" onClick={p.onClose}>닫기</button>
      </div>
    </>
  )
}
