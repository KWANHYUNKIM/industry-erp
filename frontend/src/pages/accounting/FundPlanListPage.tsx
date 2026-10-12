import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf, QUOTATION_PICKS } from '../../components/EcPeriodPicks'
import { fetchFundPlans, useFundPlanMasters } from '../../features/fundplan/api'
import FundPlanModal from '../../features/fundplan/components/FundPlanModal'
import { methodCell, won, type FundPlan } from '../../features/fundplan/types'

/**
 * 회계 II › 자금계획 › <b>계획전표조회</b>(E020511) — 2026-10-12 loginaa 실측.
 *
 * <p>기간 기본 <b>최근30일(+1개월)</b>(2026/09/12 ~ 2026/11/11). 열: 발생일자 · 입출구분 · 입력구분 · 금액 · 상대계정명 · 거래처명 ·
 * 관리번호(어음번호) · 적요 · 이체정보 · 회계반영여부. 최근 일자 · 나중에 넣은 장이 위. 출금 줄은 바탕이 옅은 빨강
 * (토큰 ec-danger-bg). 버튼줄 신규(F2) · 회계처리▴ · 선택삭제 · Excel. [발생일자]를 누르면 계획전표수정 창.
 * [선택삭제] → '전표를 삭제하겠습니까?'.
 * 출금 30,000(기업은행-1122 · 외상매입금 · 김치좋아) 저장 → 목록 '출금 · 자금 · 30,000' · 계획전표현황 그날 '예금(현금)감소 30' ·
 * 추정자금일보 기업은행-1122 감소 30,000.
 *
 * <p>[회계처리▴](입금보고서 · 지출결의서 · 일반전표)는 회계 I 전표로 넘기는 기능이라 아직 없다 — [회계반영여부]는 늘 빈칸.
 * [이체정보]는 거래처 이체계좌 등록 링크인데 거래처 화면 몫이라 글자만 둔다.
 */
export default function FundPlanListPage() {
  const title = '계획전표조회'
  const init = periodOf('최근30일(+1개월)')!
  const masters = useFundPlanMasters()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [dir, setDir] = useState<'' | 'OUT' | 'IN'>('')
  const [partner, setPartner] = useState('')
  const [memo, setMemo] = useState('')
  const [rows, setRows] = useState<FundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null })
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchFundPlans(from, to))
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const shown = useMemo(() => rows
    .filter((r) => !dir || r.direction === dir)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !memo || (r.memo ?? '').includes(memo)), [rows, dir, partner, memo])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])

  async function removePicked() {
    setConfirmDelete(false)
    try {
      await api.post('/fund-plans/delete', { ids: [...picked] })
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <EcListShell
      title={title}
      actions={[
        { label: '신규(F2)', primary: true, onClick: () => setModal({ open: true, id: null }) },
        { label: '선택삭제', disabled: picked.size === 0, onClick: () => setConfirmDelete(true) },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="발생일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="입출구분">
          {([['', '전체'], ['OUT', '출금'], ['IN', '입금']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="fp-list-dir" checked={dir === v} onChange={() => setDir(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[220px]" placeholder="적요" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </EcCond>
      </ul>

      <p className="text-right text-[12px] mb-[4px]">{from.replaceAll('-', '/')} ~{to.replaceAll('-', '/')}</p>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px] text-center">
              <input type="checkbox" aria-label="전체선택" checked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
                     onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">발생일자</th>
            <th>입출구분</th>
            <th>입력구분</th>
            <th className="text-right">금액</th>
            <th>상대계정명</th>
            <th>거래처명</th>
            <th>관리번호(어음번호)</th>
            <th>적요</th>
            <th>이체정보</th>
            <th>회계반영여부</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id} className={r.direction === 'OUT' ? '[&>td]:bg-ec-danger-bg' : undefined}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${r.planDate} ${r.id} 선택`} checked={picked.has(r.id)}
                       onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} />
              </td>
              <td className="text-center">
                <button type="button" className="ec-link" onClick={() => setModal({ open: true, id: r.id })}>{r.planDate.replaceAll('-', '/')}</button>
              </td>
              <td>{r.directionName}</td>
              <td>{methodCell(r.method)}</td>
              <td className="text-right">{Number(r.amount) ? won(Number(r.amount)) : ''}</td>
              <td>{r.counterAccountName ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
              <td>{r.noteNo ?? ''}</td>
              <td>{r.memo ?? ''}</td>
              <td>{r.partnerId ? '등록' : ''}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <FundPlanModal open={modal.open} planId={modal.id} masters={masters}
                     onClose={() => setModal({ open: false, id: null })} onSaved={() => void load()} />
      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void removePicked()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
