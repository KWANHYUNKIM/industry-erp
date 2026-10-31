import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import Modal from '../../../components/Modal'
import { EcCond } from '../../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../../api/client'
import type { ExpenseEvidenceAccount, ExpenseEvidenceStatus } from '../../../types/api'
import { JournalVatCompareView, VAT_TYPES, type JvcInit } from '../vat/JournalVatComparePage'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { EcReportFoot } from '../../../components/EcReportFrame'
import { pad2 } from '../../../utils/periods'
import { fmtNumberOrBlank } from '../../../utils/format'

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
 * 열은 부가세유형 이름 그대로 — 매출전표 I · 매입전표 I 전표는 그 유형(현금영수증 · 계산서 · 카드매입 …), 그 밖은 부가세(135) 줄이
 * 있으면 세금계산서(2026-10-13 원본: 세금계산서 · 계산서 · 현금영수증 · 증빙없음 차례).
 * 2026-10-13 원본 1469 상품만 표시로 두고 이번기수: 머리 [계정코드 · 계정명 · 세금계산서 · 증빙없음 · 합계] 모두 가운데(.ec-report 머리 공통),
 * '1469 상품 321,782,000 · (빈칸) · 321,782,000' — 세금계산서가 증빙없음 앞이고 0 은 빈칸, 금액이 없는 계정은 줄이 없다.
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
    n ? <button className="ec-link" onClick={() => setCompare({ accountId, kind })}>{fmtNumberOrBlank(n)}</button> : ''

  return (
    <EcListShell title="지출증빙현황" onSearch={() => search()} collapseConditions={data !== null}
                 optionMenu={[{ label: '계정설정', onClick: () => setSettingOpen(true) }]}
                 actions={data ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준월">
          <div className="flex items-center gap-[4px]">
            <YmSelect value={range.from} onChange={(v) => setRange({ ...range, from: v })} label="시작" />
            ~
            <YmSelect value={range.to} onChange={(v) => setRange({ ...range, to: v })} label="끝" />
          </div>
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => search()}>검색(F8)</button>
            {/* 원본: 빠른선택을 누르면 기간을 바꾸고 바로 찾는다(2026-10-20 금월 실측) */}
            {['금월', '전월', '이번기수', '직전기수'].map((l) => (
              <button key={l} className="ec-btn ec-btn-pick" onClick={() => { const r = rangeOf(l, fiscalStart); setRange(r); void search(r) }}>{l}</button>
            ))}
            <button className="ec-btn ec-btn-pick" onClick={() => setRange(rangeOf('직전기수', fiscalStart))}>다시 작성</button>
          </div>
        </li>
      </ul>

      {data && (
        <div className="w-[400px] max-w-full ec-report-tight">
          <div className="ec-report-title underline">지출증빙현황</div>
          <div className="text-right leading-[18px] mb-[5px]">{periodText(data.from, data.to)}</div>
          <table ref={tableRef} className="w-full ec-report ec-report-head400 ec-report-foot400">
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
                  <td className="text-right">{fmtNumberOrBlank(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-center">합계</td>
                  {kinds.map((k) => <td key={k} className="text-right">{colTotal(k) ? fmtNumberOrBlank(colTotal(k)) : ''}</td>)}
                  <td className="text-right">{fmtNumberOrBlank(rows.reduce((t, r) => t + Number(r.total), 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <EcReportFoot page={false} />
        </div>
      )}

      {settingOpen && <AccountSettingModal onClose={() => setSettingOpen(false)} onSaved={() => { setSettingOpen(false); void search() }} />}
      {compare && data && <CompareModal range={{ from: data.from, to: data.to }} {...compare} onClose={() => setCompare(null)} />}
    </EcListShell>
  )
}

/** 원본 [기준월] 한 쪽 — 연도 · 월 고르기 둘(원본 '2025' · '01' 단추). 값은 'YYYY-MM'. */
function YmSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const y = Number(value.slice(0, 4)) || new Date().getFullYear()
  const m = value.slice(5, 7) || '01'
  const now = new Date().getFullYear()
  const years = Array.from(new Set([now + 1, now, now - 1, now - 2, now - 3, y])).sort((a, b) => b - a)
  return (
    <>
      <select className="ec-input w-[54.8px]" aria-label={`${label} 연도`} value={y} onChange={(e) => onChange(`${e.target.value}-${m}`)}>
        {years.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select className="ec-input w-[47.5px]" aria-label={`${label} 월`} value={m} onChange={(e) => onChange(`${y}-${e.target.value}`)}>
        {Array.from({ length: 12 }, (_, i) => pad2(i + 1)).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </>
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

/**
 * 금액 링크 → 원본은 [전표vs매출매입자료비교] 화면을 조건 판 · 쪽번호 · 인쇄 · Excel 까지 통째로 창에 띄운다(2026-10-13 loginaa 실측).
 * 채우는 조건: 조회일자 = 기준월 첫날 ~ 끝날 · 계정명 = 그 계정 ·
 * 증빙 칸이면 부가세유형 = 그 칸 이름(매입 코드 먼저 — '계산서' 칸 → 23) + 전표기준 '매출매입자료 있는 것만' + 조회자료 '전체',
 * 증빙없음 칸이면 전표기준 '매출매입자료 없는 것만'(조회자료 줄은 숨는다).
 */
/** 칸 이름 → 부가세유형코드. 매입 쪽 이름을 먼저 찾고 없으면 매출(카드매출 …). 합계 칸(null)은 조건 없음. */
function vatCodesOf(kind: string | null): string[] {
  if (!kind) return []
  const t = VAT_TYPES.find((v) => v.side === '매입' && v.name === kind) ?? VAT_TYPES.find((v) => v.name === kind)
  return t ? [t.code] : []
}

function CompareModal({ range, accountId, kind, onClose }: {
  range: Range; accountId: number | null; kind: string | null; onClose: () => void
}) {
  const init: JvcInit = {
    from: `${range.from}-01`, to: `${range.to}-${pad2(lastDay(range.to))}`,
    accountIds: accountId != null ? [String(accountId)] : [],
    ...(kind === '증빙없음' ? { has: '없는것' as const } : { has: '있는것' as const, mismatch: '전체' as const, vatTypes: vatCodesOf(kind) }),
  }
  return (
    <Modal open title="전표vs매출매입자료비교" width={1100} onClose={onClose}>
      <JournalVatCompareView init={init} />
    </Modal>
  )
}
