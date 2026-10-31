import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { ymd } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import { openBonds } from '../../features/bond/ledger'
import { flatten, sideWord, type BondRow, type BondSide } from '../../features/bond/types'
import type { Partner } from '../../types/api'
import EcDateInput from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'

const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '직전기수'] as const

/** 'YYYY-MM' 에 n 달을 더한다. */
function addMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface Row {
  key: string
  managerCode: string
  managerName: string
  partnerCode: string
  partnerName: string
  creditLimit: number | null
  accountName: string
  balance: number
  months: number
  aging: number[]
  due: number[]
  mobile: string
  phone: string
}

/**
 * 회계 II › 채권관리 › <b>채권잔액분석표</b>(E060408) · 채무관리 › 채무잔액분석표 — 2026-10-12 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 기준일자(한 날, 기본 오늘) · 계정 · 거래처 · 전체잔액조회 · 대표거래처합산. 기간 버튼 금일 … 전월 · 직전기수.
 * 열: 담당자코드 · 담당자명 · 거래처코드 · 거래처명 · 여신한도 · 계정명 · 잔액 · 미회수월수 ·
 * <b>채권잔액현황</b>(발생월 기준 이번 달부터 5달 전까지 · 기타) · <b>만기일자별현황</b>(만기월 기준 이번 달부터 5달 뒤까지 · 기타) · 모바일 · 전화.
 * 거래처 · 계정마다 한 줄, 거래처 담당자마다 '{코드} / {이름} 계'(담당자 없는 거래처는 '[] / [] 계'가 먼저), 끝에 '총합계'.
 * 김치좋아(담당 S02 정재원): 2026/10 발생 50,000 + 2015 발생 98,000 → 잔액 148,000 · 미회수월수 '12 개월초과' ·
 * 잔액현황 2026/10 50,000 · 기타 98,000 · 만기 2026/10 50,000 · 기타 98,000.
 *
 * <p>우리 거래처의 담당자는 이름 글자뿐이라 [담당자코드]는 사원 목록에서 같은 이름을 찾아 붙인다.
 * [미회수월수]는 남은 채권 중 가장 이른 발생월부터 센 달 수다 — 원본에서 12달 넘는 것('12 개월초과')만 봤고, 그 안쪽 글자 모양은 못 쟀다.
 * [대표거래처합산] ◉거래처관계기준(처음) ○개별거래처기준(2026-10-22 실측) — 대표거래처로 묶는 관계 화면이 아직 없어 어느 쪽이든 결과는 같다.
 *
 * <p>2026-10-13 다시 잼: 격자는 출력물(.ec-report)이 아니라 <b>조회 목록 격자(table-list)</b> — 머리 700 · 33.8(두 줄 다 가운데),
 * 줄 28.4. '{담당} 계' · '총합계' 줄은 이름이 <b>네 칸</b>(담당자코드 ~ 거래처명)을 차지하고 700 · 바탕 247.
 * [미회수월수] 는 오른쪽, [거래처코드] 는 링크(남색) → 그 거래처 · 계정으로 연 '채권현황' 창.
 *
 * <p><b>채무잔액분석표</b>(E060508, 2026-10-13 실측)는 [여신한도] 열이 없고 [미회수월수] 대신 [미지급월수], 계 · 총합계 이름은
 * 계정명까지 <b>다섯 칸</b>이다. (주)구로 2016 발생 2,000,000 + 2026/10 30,000 → 잔액 2,030,000 · '12 개월초과' · 2026/10 30,000 · 기타 2,000,000.
 */
export default function BondBalanceAnalysisPage({ side }: { side: BondSide }) {
  const word = sideWord(side)
  /** 채무잔액분석표(E060508)는 [여신한도] 열이 없고 [미회수월수] 가 [미지급월수] 다. */
  const ar = side === 'RECEIVABLE'
  const title = `${word}잔액분석표`
  const masters = useBondMasters()
  const navigate = useNavigate()
  const [asOf, setAsOf] = useState(ymd(new Date()))
  const [account, setAccount] = useState('')
  const [partner, setPartner] = useState('')
  const [all, setAll] = useState(false)
  /** 대표거래처합산(원본 2026-10-22: 거래처관계기준이 처음) — 우리는 거래처 사이 관계(대표거래처)를 두지 않아 어느 쪽이든 개별 거래처 그대로다. */
  const [rep, setRep] = useState<'REL' | 'EACH'>('REL')
  const [rows, setRows] = useState<BondRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [employees, setEmployees] = useState<{ code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    api.get<{ code?: string; employeeNo?: string; name: string }[]>('/employees')
      .then((r) => setEmployees(r.data.map((e) => ({ code: e.code ?? e.employeeNo ?? '', name: e.name })))).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(flatten(await fetchBonds(side, asOf)))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [side, asOf])

  const base = asOf.slice(0, 7)
  const agingMonths = [0, -1, -2, -3, -4, -5].map((n) => addMonth(base, n))
  const dueMonths = [0, 1, 2, 3, 4, 5].map((n) => addMonth(base, n))

  const groups = useMemo(() => {
    const pById = new Map(partners.map((p) => [p.id, p]))
    const m = new Map<string, Row>()
    const bonds = all ? openBonds(rows, asOf) : openBonds(rows, asOf).filter((b) => Math.round(b.balance) > 0)
    for (const b of bonds) {
      if (account && String(b.accountId) !== account) continue
      if (partner && String(b.partnerId) !== partner) continue
      const p = b.partnerId != null ? pById.get(b.partnerId) : undefined
      const mgr = p?.manager ?? ''
      const k = `${b.partnerId ?? ''}/${b.accountId}`
      const r = m.get(k) ?? {
        key: k, managerCode: mgr ? employees.find((e) => e.name === mgr)?.code ?? '' : '', managerName: mgr,
        partnerCode: b.partnerCode ?? '', partnerName: b.partnerName ?? '', creditLimit: p?.creditLimit ?? null,
        accountName: b.accountName, balance: 0, months: 0, aging: Array(7).fill(0), due: Array(7).fill(0),
        mobile: p?.mobile ?? '', phone: p?.phone ?? '',
      }
      r.balance += b.balance
      const issued = b.issueDate.slice(0, 7)
      const ai = agingMonths.indexOf(issued)
      r.aging[ai >= 0 ? ai : 6] += b.balance
      const di = b.dueDate ? dueMonths.indexOf(b.dueDate.slice(0, 7)) : -1
      r.due[di >= 0 ? di : 6] += b.balance
      const [by, bm] = base.split('-').map(Number)
      const [iy, im] = issued.split('-').map(Number)
      r.months = Math.max(r.months, (by - iy) * 12 + (bm - im))
      m.set(k, r)
    }
    const g = new Map<string, Row[]>()
    for (const r of m.values()) {
      const k = `${r.managerCode}\u0000${r.managerName}`
      g.set(k, [...(g.get(k) ?? []), r])
    }
    return [...g.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, rs]) => ({ key: k, code: rs[0].managerCode, name: rs[0].managerName, rows: rs.sort((a, b) => a.partnerCode.localeCompare(b.partnerCode)) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, partners, employees, asOf, account, partner, all])

  const sum = (rs: Row[]) => ({
    balance: rs.reduce((a, r) => a + r.balance, 0),
    aging: Array.from({ length: 7 }, (_, i) => rs.reduce((a, r) => a + r.aging[i], 0)),
    due: Array.from({ length: 7 }, (_, i) => rs.reduce((a, r) => a + r.due[i], 0)),
  })
  const total = sum(groups.flatMap((g) => g.rows))
  const cell = (n: number) => (Math.round(n) ? fmtAmount(n) : '')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length])
  const monthText = (ym: string) => ym.replace('-', '/')

  const sumRow = (key: string, label: string, s: ReturnType<typeof sum>) => (
    <tr key={key} className="ec-list-total [&_td]:!font-bold">
      {/* 채권은 이름 네 칸 + 여신한도 · 계정명 빈칸, 채무는 여신한도가 없고 이름이 계정명까지 다섯 칸(2026-10-13 실측). */}
      {ar
        ? <><td colSpan={4} className="text-center">{label}</td><td className="text-center" /><td className="text-center" /></>
        : <td colSpan={5} className="text-center">{label}</td>}
      <td className="text-right">{fmtAmount(s.balance)}</td>
      <td className="text-center" />
      {s.aging.map((n, i) => <td key={`a${i}`} className="text-right">{cell(n)}</td>)}
      {s.due.map((n, i) => <td key={`d${i}`} className="text-right">{cell(n)}</td>)}
      <td className="text-center" /><td className="text-center" />
    </tr>
  )

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setAsOf(ymd(new Date())); setAccount(''); setPartner(''); setAll(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateInput className="ec-input w-[145px]" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
        <EcCond label="전체잔액조회">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> 전체잔액조회
          </label>
        </EcCond>
        <EcCond label="대표거래처합산">
          {([['REL', '거래처관계기준'], ['EACH', '개별거래처기준']] as const).map(([v, n]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="rep-partner" checked={rep === v} onChange={() => setRep(v)} /> {n}
            </label>
          ))}
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-head700 w-full text-left min-w-[1600px]">
          <thead>
            <tr>
              <th rowSpan={2}>담당자코드</th>
              <th rowSpan={2}>담당자명</th>
              <th rowSpan={2}>거래처코드</th>
              <th rowSpan={2}>거래처명</th>
              {ar && <th rowSpan={2} className="text-right">여신한도</th>}
              <th rowSpan={2}>계정명</th>
              <th rowSpan={2} className="text-right">잔액</th>
              <th rowSpan={2}>{ar ? '미회수월수' : '미지급월수'}</th>
              <th colSpan={7} className="text-center">{word}잔액현황</th>
              <th colSpan={7} className="text-center">만기일자별현황</th>
              <th rowSpan={2}>모바일</th>
              <th rowSpan={2}>전화</th>
            </tr>
            <tr>
              {agingMonths.map((m) => <th key={`a${m}`} className="text-right">{monthText(m)}</th>)}
              <th className="text-right">기타</th>
              {dueMonths.map((m) => <th key={`d${m}`} className="text-right">{monthText(m)}</th>)}
              <th className="text-right">기타</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={ar ? 24 : 23} className="ec-empty">불러오는 중…</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={ar ? 24 : 23} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : groups.flatMap((g) => [
              ...g.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.managerCode}</td>
                  <td>{r.managerName}</td>
                  <td>
                    <button type="button" className="ec-link"
                            onClick={() => navigate(`${side === 'RECEIVABLE' ? '/accounting/bonds/ar/status' : '/accounting/bonds/ap/status'}?asOf=${asOf}&partner=${r.key.split('/')[0]}&account=${r.key.split('/')[1]}`)}>
                      {r.partnerCode}
                    </button>
                  </td>
                  <td>{r.partnerName}</td>
                  {ar && <td className="text-right">{r.creditLimit ? fmtAmount(r.creditLimit) : ''}</td>}
                  <td>{r.accountName}</td>
                  <td className="text-right">{fmtAmount(r.balance)}</td>
                  <td className="text-right">{r.months > 12 ? '12 개월초과' : String(r.months)}</td>
                  {r.aging.map((n, i) => <td key={`a${i}`} className="text-right">{cell(n)}</td>)}
                  {r.due.map((n, i) => <td key={`d${i}`} className="text-right">{cell(n)}</td>)}
                  <td>{r.mobile}</td>
                  <td>{r.phone}</td>
                </tr>
              )),
              sumRow(`${g.key}-s`, `${g.code ? g.code : '[]'} / ${g.name ? g.name : '[]'} 계`, sum(g.rows)),
            ])}
          </tbody>
          {groups.length > 0 && <tfoot>{sumRow('total', '총합계', total)}</tfoot>}
        </table>
      </div>
    </EcListShell>
  )
}
