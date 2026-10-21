import { useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { dateNo } from '../../utils/dateNo'
import { SlipHistoryModal } from '../../features/sliphistory/SlipHistoryModal'

/**
 * 재고 I › 출력물 › 기타 › 거래이력조회(재고) (E040716) — 전표 <b>작업 이력</b>.
 *
 * <p>2026-10-21 loginaa 실측(판매 2026/10/21 -5 를 신규 → 수정 → 삭제 한 뒤):
 * 조건 [구분] 전표★ · 기초코드 / [작업일자] 금월(~오늘) / [작업시간] 사용 / [전표일자] 사용안함 / [메뉴](필수 — 비우면 칸만 빨갛고
 * 격자 없음, 코드도움 '메뉴검색' 견적서 … 품질검사) / [작업자] / [행위] / [기타] 최종이력만 검색★ · 수정순 / [적용양식] 기본(수정불가),
 * 판 아래 [검색(F8)] 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · 설정 · 다시 작성. 검색하면 판이 접히고 아래 [Excel].
 * 격자 작업일자 · 전표번호 · 행위 · 거래처코드 · 거래처명 · 품목명 · 담당자코드 · 담당자명 · 작업자 · 전표상태 · 이력(H).
 * 차례는 전표번호 큰 것부터, 같은 전표는 늦은 작업부터. 최종이력만 검색이면 전표마다 마지막 작업 한 줄(지운 전표는 '삭제' 한 줄).
 * 지운 전표도 그 때 거래처 · 품목이 그대로 보인다 — 서버가 행위 때 값을 박아 둔다(change_histories).
 *
 * <p>지금 이력을 적는 전표는 판매뿐이다(구매 · 재고 · 회계 · 일용은 plans/재고1.md 남은 것).
 */

/** 원본 '메뉴검색' 창 목록 차례 그대로. */
const MENUS = ['견적서', '주문서', '판매', '판매II', '출하지시서', '출하', '발주요청', '단가요청', '발주서', '구매', '작업지시서',
  '생산불출', '작업내역', '생산입고I', '생산입고II', '생산입고 III', '창고이동', '자가사용', '불량처리', '실사전표', '단계별조정전표',
  '간편조정전표', 'A/S접수', 'A/S수리', '매출계획', '품질검사요청', '품질검사']
const ACTIONS = ['신규', '수정', '삭제']

interface Row {
  id: number; target: string; targetId: number; workedAt: string; menu: string
  docDate: string | null; docNo: string | null; action: string
  partnerCode: string | null; partnerName: string | null; itemSummary: string | null
  managerCode: string | null; managerName: string | null; worker: string | null; docStatus: string | null
}

export default function TradeHistoryPage() {
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [menus, setMenus] = useState<string[]>([])
  const [worker, setWorker] = useState('')
  const [actions, setActions] = useState<string[]>([])
  const [latestOnly, setLatestOnly] = useState(true)
  const [byWorkTime, setByWorkTime] = useState(false)
  const [menuInvalid, setMenuInvalid] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Row | null>(null)

  async function load() {
    if (menus.length === 0) { setMenuInvalid(true); return }
    setMenuInvalid(false)
    setError('')
    try {
      const q = new URLSearchParams({ from, to, latestOnly: String(latestOnly), byWorkTime: String(byWorkTime) })
      menus.forEach((m) => q.append('menu', m))
      actions.forEach((a) => q.append('action', a))
      if (worker.trim()) q.set('worker', worker.trim())
      setRows((await api.get<Row[]>(`/change-history/slips?${q}`)).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  function reset() {
    setFrom(init.from); setTo(init.to); setMenus([]); setWorker(''); setActions([])
    setLatestOnly(true); setByWorkTime(false); setMenuInvalid(false); setRows(null)
  }

  const slipNo = (r: Row) => (r.docDate && r.docNo ? dateNo(r.docDate, r.docNo) : '')

  return (
    <EcListShell
      title="거래이력조회"
      searchable={false}
      /* 원본: 메뉴가 비면 판이 그대로(메뉴 칸만 빨강), 찾으면 접히고 머리에 [Search(F3)] */
      collapseConditions={rows !== null}
      onReset={reset}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          <label className="mr-[12px]"><input type="radio" checked readOnly /> 전표</label>
          <label title="기초코드(품목 · 거래처 …) 작업 이력은 아직 없습니다."><input type="radio" disabled /> 기초코드</label>
        </EcCond>
        <EcCond label="작업일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="메뉴" pick>
          <CodePickerField label="메뉴" hideLabel width={300} popupTitle="메뉴검색" hideNew plain invalid={menuInvalid} emptyLabel="메뉴"
                           value={menus[0] ?? ''} onChange={(v) => { setMenus(v ? [v] : []); if (v) setMenuInvalid(false) }}
                           items={MENUS.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="작업자">
          <input className="ec-input w-[300px]" placeholder="작업자" value={worker} onChange={(e) => setWorker(e.target.value)} />
        </EcCond>
        <EcCond label="행위" pick>
          <CodePickerField label="행위" hideLabel width={300} popupTitle="행위검색" hideNew plain emptyLabel="행위"
                           value={actions[0] ?? ''} onChange={(v) => setActions(v ? [v] : [])}
                           items={ACTIONS.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="기타">
          <label className="mr-[12px]"><input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} /> 최종이력만 검색</label>
          <label><input type="checkbox" checked={byWorkTime} onChange={(e) => setByWorkTime(e.target.checked)} /> 수정순</label>
        </EcCond>
        <EcCond label="적용양식">
          <select className="ec-input w-[300px]" disabled><option>기본(수정불가)</option></select>
        </EcCond>
      </ul>

      {rows && (
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-center">작업일자</th><th>전표번호</th><th className="text-center">행위</th><th>거래처코드</th><th>거래처명</th><th>품목명</th>
              <th>담당자코드</th><th>담당자명</th><th className="text-center">작업자</th><th className="text-center">전표상태</th><th className="text-center">이력</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td className="text-center">{r.docStatus ?? ''}</td>
                <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setHistory(r) }}>H</a></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
          </tbody>
        </table>
      )}
      {history && (
        <SlipHistoryModal target={history.target} id={history.targetId} head={`[${slipNo(history)}]`} onClose={() => setHistory(null)} />
      )}
    </EcListShell>
  )
}
