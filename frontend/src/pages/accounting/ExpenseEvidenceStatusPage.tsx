import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { ExpenseEvidenceAccount, ExpenseEvidenceCompareRow, ExpenseEvidenceStatus } from '../../types/api'
import { dateNo } from '../../utils/dateNo'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { EcReportFoot } from '../../components/EcReportFrame'

const won = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))
const pad2 = (n: number) => String(n).padStart(2, '0')
const ymOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
const lastDay = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate()
/** 원본 머리의 기간 — '2026/01/01 ~2026/10/31'(물결 앞에만 띄어 쓴다) */
const periodText = (from: string, to: string) => `${from.replace('-', '/')}/01 ~${to.replace('-', '/')}/${pad2(lastDay(to))}`

type Range = { from: string; to: string }

/** 빠른선택 — 원본 금월 · 전월 · 이번기수(기수 첫 달 ~ 이번 달) · 직전기수(지난 기수 열두 달). 2026-10-04 실측. */
function rangeOf(label: string, fiscalStart: number, today = new Date()): Range {
  const y = today.getFullYear(), m = today.getMonth()
  const start = today.getMonth() + 1 >= fiscalStart ? y : y - 1
  switch (label) {
    case '금월': return { from: ymOf(today), to: ymOf(today) }
    case '전월': { const p = new Date(y, m - 1, 1); return { from: ymOf(p), to: ymOf(p) } }
    case '이번기수': return { from: `${start}-${pad2(fiscalStart)}`, to: ymOf(today) }
    default: return { from: `${start - 1}-${pad2(fiscalStart)}`, to: ymOf(new Date(start, fiscalStart - 2, 1)) }
  }
}

/**
 * 지출증빙현황 (원본 세무 › 법인세 E030402, 2026-10-04 loginaa 실측).
 *
 * <p>조건 [기준월](달 구간, 기본 <b>직전기수</b>) · 빠른선택 금월 · 전월 · 이번기수 · 직전기수. 결과는 출력물 꼴 —
 * 제목 '지출증빙현황' · 기간 · 표 [계정코드 · 계정명 · (증빙별) · 합계] + 합계줄 · 조회 시각.
 * <b>[Option › 계정설정]</b>에서 계정마다 인쇄방법 표시안함 · 표시를 고르고, 표시인 계정만 나온다 — 원본은 337개 계정이
 * 모두 표시안함이라 처음엔 '등록된 데이터가 없습니다.' 다. 자료가 없어도 '증빙없음' 열은 있다.
 *
 * <p>증빙은 분개 줄의 전표에 이어진 매출매입자료의 유형이고 없으면 '증빙없음'. 원본 실측: 8109 복리후생비(판)
 * 2026/01~10 증빙없음 7,962,500 · 합계 7,962,500. 금액 링크 → <b>전표vs매출매입자료비교</b>
 * [전표자료: 전표번호 · 계정 · 거래처 · 차변 · 대변 | 매출매입자료: 매출매입번호 · 유형명 · 거래처 · 공급가액 · 부가세 · 합계] + 합계.
 * 우리 매출매입자료는 매입/매출장과 같이 매입 부가세(135) 줄이 든 회계전표이고 유형은 늘 세금계산서다.
 * 세금계산서 열이 증빙없음 앞에 서는 차례는 원본 자료가 없어 못 쟀다.
 */
export default function ExpenseEvidenceStatusPage() {
  const [fiscalStart, setFiscalStart] = useState(1)
  const [range, setRange] = useState<Range>(rangeOf('직전기수', 1))
  const [data, setData] = useState<ExpenseEvidenceStatus | null>(null)
  const [error, setError] = useState('')
  const [settingOpen, setSettingOpen] = useState(false)
  const [compare, setCompare] = useState<{ accountId: number | null; kind: string | null } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '지출증빙현황', [data])

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => {
        const m = Number(r.data?.fiscalStart)
        if (m >= 1 && m <= 12) { setFiscalStart(m); setRange(rangeOf('직전기수', m)) }
      })
      .catch(() => undefined)
  }, [])

  async function search(r: Range = range) {
    setError('')
    if (!r.from || !r.to) { setError('기준월을 입력해주세요.'); return }
    try {
      setData((await api.get<ExpenseEvidenceStatus>('/expense-evidence', { params: r })).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const kinds = data?.kinds ?? ['증빙없음']
  const rows = data?.rows ?? []
  const colTotal = (k: string) => rows.reduce((t, r) => t + Number(r.amounts[k] ?? 0), 0)
  const amountLink = (n: number | undefined, accountId: number | null, kind: string | null) =>
    n ? <button className="ec-link" onClick={() => setCompare({ accountId, kind })}>{won(n)}</button> : ''

  return (
    <EcListShell title="지출증빙현황" onSearch={() => search()} collapseConditions={data !== null}
                 actions={[{ label: '인쇄', primary: true }, { label: 'Excel' }, { label: '계정설정', onClick: () => setSettingOpen(true) }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => search()}>검색(F8)</button>
            {['금월', '전월', '이번기수', '직전기수'].map((l) => (
              <button key={l} className="ec-btn" onClick={() => setRange(rangeOf(l, fiscalStart))}>{l}</button>
            ))}
            <button className="ec-btn" onClick={() => setRange(rangeOf('직전기수', fiscalStart))}>다시 작성</button>
          </div>
        </li>
      </ul>

      {data && (
        <div className="w-[400px] max-w-full">
          <div className="ec-report-title underline">지출증빙현황</div>
          <div className="text-right mb-[4px]">{periodText(data.from, data.to)}</div>
          <table ref={tableRef} className="w-full ec-report ec-report-head400">
            <thead>
              <tr><th>계정코드</th><th>계정명</th>{kinds.map((k) => <th key={k} className="text-right">{k}</th>)}<th className="text-right">합계</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={kinds.length + 3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.accountId}>
                  <td>{r.accountCode}</td>
                  <td>{r.accountName}</td>
                  {kinds.map((k) => <td key={k} className="text-right">{amountLink(r.amounts[k], r.accountId, k)}</td>)}
                  <td className="text-right">{won(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-center">합계</td>
                  {kinds.map((k) => <td key={k} className="text-right">{won(colTotal(k))}</td>)}
                  <td className="text-right">{won(rows.reduce((t, r) => t + Number(r.total), 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <EcReportFoot page={false} />
        </div>
      )}

      {settingOpen && <AccountSettingModal onClose={() => setSettingOpen(false)} onSaved={() => { setSettingOpen(false); if (data) void search() }} />}
      {compare && data && <CompareModal range={{ from: data.from, to: data.to }} {...compare} onClose={() => setCompare(null)} />}
    </EcListShell>
  )
}

/** 원본 [Option › 계정설정] — 계정코드 · 계정명 · 검색창내용 · 인쇄방법(◉표시안함 ○표시). */
function AccountSettingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<ExpenseEvidenceAccount[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<ExpenseEvidenceAccount[]>('/expense-evidence/accounts').then((r) => setAccounts(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [])

  async function save() {
    try {
      await api.put('/expense-evidence/accounts', { shownIds: accounts.filter((a) => a.shown).map((a) => a.id) })
      onSaved()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const shown = accounts.filter((a) => !q.trim() || `${a.code} ${a.name}`.includes(q.trim()))
  const setShown = (id: number, v: boolean) => setAccounts(accounts.map((a) => (a.id === id ? { ...a, shown: v } : a)))

  return (
    <Modal open title="계정설정" width={680} error={error} onClose={onClose}>
      <div className="flex justify-between items-center mb-[8px]">
        <b>계정설정</b>
        <input className="ec-input w-[134px]" placeholder="입력 후 [Enter]" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-[440px] overflow-auto">
        <table className="w-full">
          <thead><tr><th>계정코드</th><th>계정명</th><th>검색창내용</th><th>인쇄방법</th></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <td>{a.code}</td>
                <td>{a.name}</td>
                <td></td>
                <td>
                  <label className="inline-flex items-center gap-[3px] mr-[10px]">
                    <input type="radio" name={`ev-${a.id}`} checked={!a.shown} onChange={() => setShown(a.id, false)} /> 표시안함
                  </label>
                  <label className="inline-flex items-center gap-[3px]">
                    <input type="radio" name={`ev-${a.id}`} checked={a.shown} onChange={() => setShown(a.id, true)} /> 표시
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 금액 링크 → 원본 '전표vs매출매입자료비교' 창. 한 전표의 여러 줄은 전표번호 · 매출매입자료 칸을 묶는다. */
function CompareModal({ range, accountId, kind, onClose }: {
  range: Range; accountId: number | null; kind: string | null; onClose: () => void
}) {
  const [rows, setRows] = useState<ExpenseEvidenceCompareRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<ExpenseEvidenceCompareRow[]>('/expense-evidence/compare', { params: { ...range, accountId, kind } })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [range.from, range.to, accountId, kind])   // eslint-disable-line react-hooks/exhaustive-deps

  /* 같은 전표의 줄 수 — 첫 줄에 rowSpan */
  const span = new Map<number, number>()
  rows.forEach((r) => span.set(r.entryId, (span.get(r.entryId) ?? 0) + 1))
  const seen = new Set<number>()
  const firstOf = (id: number) => (seen.has(id) ? false : (seen.add(id), true))
  const sum = (k: 'debit' | 'credit') => rows.reduce((t, r) => t + Number(r[k]), 0)
  /* 매출매입자료는 전표마다 한 번만 센다 */
  const perEntry = [...new Map(rows.map((r) => [r.entryId, r])).values()]
  const vatSum = (k: 'supply' | 'vat' | 'vatTotal') => perEntry.reduce((t, r) => t + Number(r[k]), 0)
  const vatTotals = { supply: vatSum('supply'), vat: vatSum('vat'), vatTotal: vatSum('vatTotal') }

  return (
    <Modal open title="전표vs매출매입자료비교" width={1000} error={error} onClose={onClose}>
      <div className="ec-report-title">전표vs매출매입자료비교</div>
      <div className="text-right mb-[4px]">{periodText(range.from, range.to)}</div>
      <div className="max-h-[440px] overflow-auto">
        <table className="w-full ec-report ec-report-head400">
          <thead>
            <tr><th colSpan={5}>전표자료</th><th colSpan={6}>매출매입자료</th></tr>
            <tr>
              <th>전표번호</th><th>계정</th><th>거래처</th><th>차변</th><th>대변</th>
              <th>매출매입번호</th><th>유형명</th><th>거래처</th><th>공급가액</th><th>부가세</th><th>합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r, i) => {
              const first = firstOf(r.entryId)
              const n = span.get(r.entryId) ?? 1
              return (
                <tr key={`${r.entryId}-${i}`}>
                  {first && <td rowSpan={n}>{dateNo(r.entryDate, r.docNo)}</td>}
                  <td>{r.accountName}</td>
                  <td>{r.partnerName ?? ''}</td>
                  <td className="text-right">{won(r.debit)}</td>
                  <td className="text-right">{won(r.credit)}</td>
                  {first && <>
                    <td rowSpan={n}>{r.vatDocNo ? dateNo(r.entryDate, r.vatDocNo) : ''}</td>
                    <td rowSpan={n}>{r.vatKind ?? ''}</td>
                    <td rowSpan={n}>{r.vatPartnerName ?? ''}</td>
                    <td rowSpan={n} className="text-right">{won(r.supply)}</td>
                    <td rowSpan={n} className="text-right">{won(r.vat)}</td>
                    <td rowSpan={n} className="text-right">{won(r.vatTotal)}</td>
                  </>}
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} className="text-center">합계</td>
                <td className="text-right">{won(sum('debit'))}</td>
                <td className="text-right">{won(sum('credit'))}</td>
                <td colSpan={3}></td>
                <td className="text-right">{won(vatTotals.supply)}</td>
                <td className="text-right">{won(vatTotals.vat)}</td>
                <td className="text-right">{won(vatTotals.vatTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
