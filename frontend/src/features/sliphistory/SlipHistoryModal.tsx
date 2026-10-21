import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { historyTime, type HistoryRow } from '../../components/EcHistory'

/** 전표 [H] 한 줄 — 서버 ChangeHistoryResponse(docStatus 는 그 때 전표상태). */
export type SlipHistoryRow = HistoryRow & { docStatus: string | null }

/** 수정 창 [H] 머리 — 원본 '[2026/10/28 -2]'(일자 + 번호의 끝 숫자). */
export function slipHeadLabel(date: string, no: string): string {
  const n = Number(no.split('-').pop())
  return `[${date.replace(/-/g, '/')} -${Number.isFinite(n) && n > 0 ? n : no}]`
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** '2026/10/21 (수) 오후 1:48:24' — 원본 판매 수정 창 [H] 작업일시 꼴(요일이 붙는다). */
export function slipHistoryTime(iso: string): string {
  const t = historyTime(iso)
  const day = WEEK[new Date(`${iso.slice(0, 10)}T00:00:00`).getDay()]
  return `${t.slice(0, 10)} (${day})${t.slice(10)}`
}

/**
 * 전표 '이력' 창 — 원본(2026-10-21 loginaa 판매 2026/10/21 -5 실측) 두 꼴:
 * - 수정 창 [H](`withSections`): 머리 '[20261021-5]', '거래이력' 격자 [No.][작업자ID][작업일시(요일)][전표상태][진행상태][행위]
 *   + '보안이력' · '발송이력'(작업자ID · 작업일시 · 행위, 우리는 늘 '등록된 데이터가 없습니다.') + [닫기].
 * - 거래이력조회(재고) [H]: 머리 '[2026/10/21 -5]', 격자 [No.][작업자ID][작업일시][전표상태][진행상태][상태] + [닫기].
 */
export function SlipHistoryModal({ target, id, docNo, head, withSections, lastUpdate, confirmLabel, onClose }: {
  target: string; id?: number; head: string; withSections?: boolean
  /** 재고 · 생산 수정 창 [H] — 격자 아래 '최종Update : … [작업자]' 한 줄(거래이력조회의 [H] 에는 없다). */
  lastUpdate?: boolean
  /** 수정하면 행 id 가 바뀌는 전표(창고이동 · 조정 · 작업지시서 · 생산불출 · 생산입고)는 전표번호로 연다. */
  docNo?: string
  /** 전표상태 칸을 이 글자로 — 견적서 · 주문서는 서버 docStatus 가 진행상태라 [전표상태] 는 '확인'(원본 견적서 [H] 실측). */
  confirmLabel?: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<SlipHistoryRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const url = docNo != null
      ? `/change-history/by-no?target=${encodeURIComponent(target)}&docNo=${encodeURIComponent(docNo)}`
      : `/change-history?target=${encodeURIComponent(target)}&id=${id}`
    api.get<SlipHistoryRow[]>(url)
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [target, id, docNo])
  const empty = (cols: number) => <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
  return (
    <Modal open title="이력" width={960} onClose={onClose} error={error}>
      <div className="text-[12px] mb-[6px]">{head}</div>
      {withSections && <div className="text-[13px] font-bold mb-[6px]">거래이력</div>}
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[61px]" /><th className="w-[252px]">작업자ID</th><th className="w-[378px]">작업일시</th>
            <th className="w-[189px]">전표상태</th><th className="w-[189px]">진행상태</th><th className="w-[189px]">{withSections ? '행위' : '상태'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seq}>
              <td className="text-center">{r.seq}</td>
              <td className="text-center text-ec-navy">{(r.worker ?? '').toUpperCase()}</td>
              <td className="text-center">{withSections ? slipHistoryTime(r.workedAt) : historyTime(r.workedAt)}</td>
              <td className="text-center">{confirmLabel ?? r.docStatus ?? ''}</td>
              <td className="text-center">{r.docStatus ?? ''}</td>
              <td className="text-center">{r.action}</td>
            </tr>
          ))}
          {rows.length === 0 && !error && empty(6)}
        </tbody>
      </table>
      {withSections && ['보안이력', '발송이력'].map((t) => (
        <div key={t}>
          <div className="text-[13px] font-bold mt-[12px] mb-[6px]">{t}</div>
          <table className="w-full">
            <thead><tr><th className="w-[61px]" /><th>작업자ID</th><th>작업일시</th><th>행위</th></tr></thead>
            <tbody>{empty(4)}</tbody>
          </table>
        </div>
      ))}
      {/* 원본 창고이동 · 자가사용 · 불량처리 수정 창 [H](2026-10-21 실측): 격자 아래 '최종Update : 2026/09/25 오후 11:02:36 [ECOUNTSYS]' 한 줄. */}
      {lastUpdate && rows.length > 0 && (
        <div className="text-[12px] mt-[6px]">최종Update : {historyTime(rows[rows.length - 1].workedAt)} [{(rows[rows.length - 1].worker ?? '').toUpperCase()}]</div>
      )}
      <div className="flex gap-[6px] mt-[10px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 수정 창 [최종이력] — 원본 '최종이력' 창: 한 줄 '2026/10/21 (수) 오후 1:48:49 [GUEST]' + [닫기]. */
export function SlipLastHistoryModal({ target, id, onClose }: { target: string; id: number; onClose: () => void }) {
  const [rows, setRows] = useState<SlipHistoryRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<SlipHistoryRow[]>(`/change-history?target=${encodeURIComponent(target)}&id=${id}`)
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [target, id])
  const r = rows[rows.length - 1]
  return (
    <Modal open title="최종이력" width={480} onClose={onClose} error={error}>
      <div className="text-center py-[6px]">{r ? `${slipHistoryTime(r.workedAt)} [${(r.worker ?? '').toUpperCase()}]` : ''}</div>
      <div className="flex gap-[6px] mt-[10px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
