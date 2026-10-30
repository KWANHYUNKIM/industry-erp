import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { periodOf } from '../../utils/periods'
import { dateNo } from '../../utils/dateNo'
import { exportTableToXlsx } from '../../utils/excel'
import { SlipHistoryModal } from './SlipHistoryModal'

/** 서버 거래이력 한 줄 — GET /change-history/slips (거래이력조회(재고)와 같은 꼴). */
interface Row {
  id: number; target: string; targetId: number; workedAt: string; menu: string
  docDate: string | null; docNo: string | null; action: string
  partnerCode: string | null; partnerName: string | null; itemSummary: string | null
  managerCode: string | null; managerName: string | null; worker: string | null; docStatus: string | null
}

/** 원본 쪽 나눔 — 거래이력조회와 같이 100줄마다. */
const PAGE_SIZE = 100

/**
 * 조회 화면 하단 [이력조회] → '<메뉴> 이력조회' 창 — 그 메뉴 전표의 작업 이력(2026-10-30 loginaa 실측: 판매조회 [이력조회 ▴] ›
 * 판매 이력조회 · 판매 II 이력조회, 견적서조회 · 주문서조회 · 출하지시서조회 · 출하조회 [이력조회]).
 * 창 머리 '<메뉴> 이력조회', 오른쪽 '금월 1일 ~ 오늘', 격자 작업일자 · 전표번호(판매) / 일자-No.(나머지) · 행위 · 거래처코드 · 거래처명 ·
 * 품목명 / 품목명(요약) · 담당자코드 · 담당자명 · 작업자 · 전표상태 · 이력(H) — 전표마다 마지막 작업 한 줄, 작업일자 늦은 것부터. 아래 [Excel] [닫기].
 * 거래이력조회(재고) E040716 의 [메뉴] 를 그 하나로 고정한 것과 같다(같은 서버 /change-history/slips).
 * 원본 창 머리의 [Search(F3)] · [Option] 은 없다(기간은 금월 고정 — 다른 기간은 거래이력조회(재고)).
 */
export function SlipMenuHistoryModal({ menu, title, noLabel = '일자-No.', itemLabel = '품목명(요약)', statusLabel, onClose }: {
  /** 서버 이력의 메뉴 이름(견적서 · 주문서 · 판매 · 출하지시서 · 출하). */
  menu: string
  /** 창 제목 — 없으면 '<menu> 이력조회'. */
  title?: string
  noLabel?: string
  itemLabel?: string
  /**
   * [전표상태] 칸을 이 글자로 — 견적서 · 주문서 · 출하지시서 · 출하는 서버 docStatus 가 진행상태(진행중 · 출하완료)라
   * 원본 이력조회 창의 '확인' 과 다르다(SlipHistoryModal confirmLabel 과 같은 까닭).
   */
  statusLabel?: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [history, setHistory] = useState<Row | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const range = periodOf('금월(~오늘)')!
  const heading = title ?? `${menu} 이력조회`

  useEffect(() => {
    const q = new URLSearchParams({ from: range.from, to: range.to, latestOnly: 'true', byWorkTime: 'true' })
    q.append('menu', menu)
    api.get<Row[]>(`/change-history/slips?${q}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [menu, range.from, range.to])

  const slipNo = (r: Row) => (r.docDate && r.docNo ? dateNo(r.docDate, r.docNo) : '')
  const pages = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1

  return (
    <Modal open title={heading} width={1100} onClose={onClose} error={error}>
      <div className="flex items-center justify-between mb-[6px]">
        <b className="text-[14px]">{heading}</b>
        <span className="text-[12px]">{range.from.replace(/-/g, '/')} ~ {range.to.replace(/-/g, '/')}</span>
      </div>
      {pages > 1 && (
        <nav className="ec-paging mb-[6px]" aria-label="쪽">
          {Array.from({ length: pages }, (_, n) => n + 1).map((n) => (
            <button key={n} type="button" className={n === page ? 'active' : undefined} onClick={() => setPage(n)}>{n}</button>
          ))}
        </nav>
      )}
      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="text-center">작업일자</th><th>{noLabel}</th><th className="text-center">행위</th><th>거래처코드</th><th>거래처명</th><th>{itemLabel}</th>
            <th>담당자코드</th><th>담당자명</th><th className="text-center">작업자</th><th className="text-center">전표상태</th><th className="text-center">이력</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
            <tr key={r.id}>
              <td className="text-center">{r.workedAt.slice(0, 10).replace(/-/g, '/')}</td>
              <td>{slipNo(r)}</td>
              <td className="text-center">{r.action}</td>
              <td>{r.partnerCode ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
              <td>{r.itemSummary ?? ''}</td>
              <td>{r.managerCode ?? ''}</td>
              <td>{r.managerName ?? ''}</td>
              <td className="text-center">{(r.worker ?? '').toUpperCase()}</td>
              <td className="text-center">{r.action === '삭제' ? (r.docStatus ?? '') : (statusLabel ?? r.docStatus ?? '')}</td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setHistory(r) }}>H</a></td>
            </tr>
          ))}
          {rows && rows.length === 0 && <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn" onClick={() => { if (tableRef.current) void exportTableToXlsx(tableRef.current, heading) }}>Excel</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
      {history && (
        <SlipHistoryModal target={history.target} id={history.targetId} head={`[${slipNo(history)}]`} onClose={() => setHistory(null)} />
      )}
    </Modal>
  )
}

/** 원본 데모 계정의 [Email] 알림 대신 — 우리는 메일을 밖으로 보내지 않는다(원본 '데모에서는 해당 기능이 제한되어 있습니다.'). */
export const EMAIL_NOT_HERE = '이 기능은 이 ERP 에서 제공하지 않습니다.\n(Email 발송)'

/** 원본 [바코드(품목)] — 고른 줄이 있으면 품목 바코드 인쇄 창. 우리는 바코드 인쇄가 없다(고른 줄이 없으면 셸이 원본 알림을 먼저 띄운다). */
export const BARCODE_NOT_HERE = '이 기능은 이 ERP 에서 제공하지 않습니다.\n(바코드(품목) 인쇄)'
