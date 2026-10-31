import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { periodOf } from '../../components/EcPeriodPicks'
import type { JournalEntry } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { fmtAmountBlank } from '../../utils/format'


interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface Opt { id: number; code: string; name: string }
/** /api/accounting-reflection 한 줄 — 판매 · 구매 전표와 그 회계전표(반영했으면). */
interface Slip {
  id: number; docNo: string; slipDate: string
  partnerId: number | null; partnerName: string | null
  warehouseId: number | null; warehouseName: string | null
  projectId: number | null; projectName: string | null
  itemSummary: string | null
  supplyAmount: number; totalAmount: number
  reflected: boolean; journalEntryId: number | null; journalDocNo: string | null
}
type StockKind = '판매' | '구매' | '생산입고'
interface AcctRow { entryId: number; date: string; docNo: string; account: string; dept: string; project: string; partner: string; amount: number }
interface Row { key: string; a: AcctRow | null; s: Slip | null }

/** 'YYYY-MM' 의 첫날 · 끝날 */
const monthStart = (m: string) => `${m}-01`
const monthEnd = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`
}

/**
 * 회계 I &gt; 출력물 &gt; 기타 &gt; <b>회계 vs. 재고 비교</b>(E010730) — 2026-10-20 loginaa 실측.
 *
 * <p>조건: 조회일자(<b>월</b> 구간, 기본 전월 ~ 금월) · 회계거래처 · 회계계정 · 회계부서 · 회계프로젝트 · 재고구분(판매 · 구매 · 생산입고) ·
 * 재고거래처 · 재고창고 · 재고프로젝트 · 금액(◉공급가액 ○합계금액 — 재고 쪽 금액) · 대상(☑프로젝트 ☑거래처).
 * 회계거래처 · 회계계정 · 재고거래처를 비우고 [검색(F8)] 하면 그 칸에 빨간 테두리만 두르고 찾지 않는다(문구 없음).
 *
 * <p>표는 머리 두 줄 — 회계(전표번호 · 계정 · 부서 · 프로젝트 · 거래처 · 금액 · 내역보기) | 재고(전표번호 · 품목 · 창고 · 프로젝트 · 거래처 · 금액 ·
 * 회계전표일자-No.). 재고 전표를 회계반영했으면 그 회계전표 줄과 한 줄에 서고, 반영하지 않은 판매는 재고 쪽만 찬다 —
 * 원본에서 판매 1건(코카콜라 1 × 800)을 넣고 외상매출금으로 보면 회계 칸은 비고 재고 금액 800 · 회계전표일자-No. 빈칸이었다
 * (합계금액으로 바꾸면 880). 끝 줄은 '합계'(5칸) · 회계 금액 | '합계'(5칸) · 재고 금액. 검색하면 조건 판이 접히고 머리에 [Search(F3)].
 */
export default function AccountingVsStockPage() {
  const ym = (d: string) => d.slice(0, 7)
  const init = periodOf('전월+금월')!
  const [fromM, setFromM] = useState(ym(init.from))
  const [toM, setToM] = useState(ym(init.to))
  const [partners, setPartners] = useState<Opt[]>([])
  const [accounts, setAccounts] = useState<Opt[]>([])
  const [warehouses, setWarehouses] = useState<Opt[]>([])
  const deptProject = useDeptProjectItems()
  const [aPartner, setAPartner] = useState('')
  const [aAccount, setAAccount] = useState('')
  const [aDept, setADept] = useState('')
  const [aProject, setAProject] = useState('')
  const [kind, setKind] = useState<StockKind>('판매')
  const [sPartner, setSPartner] = useState('')
  const [sWarehouse, setSWarehouse] = useState('')
  const [sProject, setSProject] = useState('')
  const [withVat, setWithVat] = useState(false)
  const [byProject, setByProject] = useState(true)
  const [byPartner, setByPartner] = useState(true)
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Opt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    api.get<Opt[]>('/accounts', { params: { slip: true } }).then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<Opt[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => setWarehouses([]))
  }, [])

  const partnerItems = useMemo(() => partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name })), [partners])
  const nameOf = (items: { value: string; name: string }[], id: number | null | undefined) =>
    id == null ? '' : items.find((i) => i.value === String(id))?.name ?? ''

  async function load(range?: { from: string; to: string }) {
    const f = range?.from ?? fromM
    const t = range?.to ?? toM
    const miss = new Set<string>()
    if (!aPartner) miss.add('aPartner')
    if (!aAccount) miss.add('aAccount')
    if (!sPartner) miss.add('sPartner')
    setInvalid(miss)
    if (miss.size > 0) return
    setLoading(true)
    setError('')
    try {
      const from = monthStart(f)
      const to = monthEnd(t)
      const journals = (await api.get<JournalList>('/journals', { params: { from, to, all: true } })).data.rows
      const slips: Slip[] = kind === '생산입고' ? [] : (await api.get<Slip[]>('/accounting-reflection', {
        params: { kind: kind === '판매' ? 'SALES' : 'PURCHASE' },
      })).data
      const acct: AcctRow[] = []
      for (const e of journals) {
        /* 원본(2026-10-22 실측): 일반전표(손으로 넣은 MANUAL)는 같은 거래처 · 계정이어도 회계 쪽에 오르지 않는다 — 매출 · 매입 전표만. */
        if (e.sourceType === 'MANUAL') continue
        for (const l of e.lines) {
          if (String(l.accountId) !== aAccount) continue
          const pid = l.partnerId ?? e.partnerId
          if (String(pid) !== aPartner) continue
          if (aDept && String(l.departmentId) !== aDept) continue
          if (aProject && String(l.projectId) !== aProject) continue
          acct.push({
            entryId: e.id, date: e.entryDate, docNo: dateNo(e.entryDate, e.docNo), account: l.accountName,
            dept: nameOf(deptProject.departments, l.departmentId), project: nameOf(deptProject.projects, l.projectId),
            partner: l.partnerName ?? e.partnerName ?? '', amount: Number(l.debit) + Number(l.credit),
          })
        }
      }
      const stock = slips
        .filter((s) => s.slipDate >= from && s.slipDate <= to)
        .filter((s) => String(s.partnerId) === sPartner)
        .filter((s) => !sWarehouse || String(s.warehouseId) === sWarehouse)
        .filter((s) => !sProject || String(s.projectId) === sProject)
      /* 재고 전표를 회계반영했으면 그 회계전표 줄과 한 줄에 세운다 — 남는 쪽은 혼자 한 줄. */
      const used = new Set<AcctRow>()
      const out: Row[] = []
      for (const s of stock) {
        const a = acct.find((x) => !used.has(x) && x.entryId === s.journalEntryId) ?? null
        if (a) used.add(a)
        out.push({ key: `s${s.id}`, a, s })
      }
      for (const a of acct) if (!used.has(a)) out.push({ key: `a${a.entryId}-${out.length}`, a, s: null })
      const dateOf = (r: Row) => r.s?.slipDate ?? r.a?.date ?? ''
      out.sort((x, y) => (dateOf(x) < dateOf(y) ? -1 : dateOf(x) > dateOf(y) ? 1 : 0))
      setRows(out)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const pick = (label: string) => {
    const r = periodOf(label)
    if (!r) return
    setFromM(ym(r.from)); setToM(ym(r.to))
    void load({ from: ym(r.from), to: ym(r.to) })
  }
  const reset = () => {
    setFromM(ym(init.from)); setToM(ym(init.to))
    setAPartner(''); setAAccount(''); setADept(''); setAProject('')
    setKind('판매'); setSPartner(''); setSWarehouse(''); setSProject('')
    setWithVat(false); setByProject(true); setByPartner(true); setInvalid(new Set())
  }

  const stockAmt = (s: Slip) => Number(withVat ? s.totalAmount : s.supplyAmount)
  const sumA = (rows ?? []).reduce((t, r) => t + (r.a?.amount ?? 0), 0)
  const sumS = (rows ?? []).reduce((t, r) => t + (r.s ? stockAmt(r.s) : 0), 0)

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '회계 vs. 재고 비교', [rows?.length])

  const box = (k: string, el: ReactNode) => <div className={`inline-block${invalid.has(k) ? ' ec-invalid' : ''}`}>{el}</div>
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title="회계 vs. 재고 비교"
      searchable={false}
      collapseConditions={rows !== null}
      onReset={reset}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '금월(~오늘)', onClick: () => pick('금월(~오늘)') },
        { label: '전월', onClick: () => pick('전월') },
        { label: '전월+금월', onClick: () => pick('전월+금월') },
        { label: '금년', onClick: () => pick('금년') },
        { label: '전년', onClick: () => pick('전년') },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="조회일자">
          <input type="month" className="ec-input w-[130px]" aria-label="조회일자 시작" value={fromM} onChange={(e) => setFromM(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="month" className="ec-input w-[130px]" aria-label="조회일자 끝" value={toM} onChange={(e) => setToM(e.target.value)} />
        </EcCond>
        <EcCond label="회계거래처" pick>
          {box('aPartner', <CodePickerField label="회계거래처" hideLabel width={220} value={aPartner} onChange={setAPartner} items={partnerItems} />)}
        </EcCond>
        <EcCond label="회계계정" pick>
          {box('aAccount', <CodePickerField label="회계계정" hideLabel width={220} value={aAccount} onChange={setAAccount}
                                            items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />)}
        </EcCond>
        <EcCond label="회계부서" pick>
          <CodePickerField label="회계부서" hideLabel width={220} emptyLabel="전체" value={aDept} onChange={setADept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="회계프로젝트" pick>
          <CodePickerField label="회계프로젝트" hideLabel width={220} emptyLabel="전체" value={aProject} onChange={setAProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="재고구분">
          <select className="ec-input w-[220px]" aria-label="재고구분" value={kind} onChange={(e) => setKind(e.target.value as StockKind)}>
            <option value="판매">판매</option>
            <option value="구매">구매</option>
            <option value="생산입고">생산입고</option>
          </select>
        </EcCond>
        <EcCond label="재고거래처" pick>
          {box('sPartner', <CodePickerField label="재고거래처" hideLabel width={220} value={sPartner} onChange={setSPartner} items={partnerItems} />)}
        </EcCond>
        <EcCond label="재고창고" pick>
          <CodePickerField label="재고창고" hideLabel width={220} emptyLabel="전체" value={sWarehouse} onChange={setSWarehouse}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
        </EcCond>
        <EcCond label="재고프로젝트" pick>
          <CodePickerField label="재고프로젝트" hideLabel width={220} emptyLabel="전체" value={sProject} onChange={setSProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="금액">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="radio" name="vs-amount" checked={!withVat} onChange={() => setWithVat(false)} /> 공급가액
          </label>
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="radio" name="vs-amount" checked={withVat} onChange={() => setWithVat(true)} /> 합계금액
          </label>
        </EcCond>
        <EcCond label="대상">
          {check('프로젝트', byProject, setByProject)}
          {check('거래처', byPartner, setByPartner)}
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th colSpan={7} className="text-center">회계</th>
            <th colSpan={7} className="text-center">재고</th>
          </tr>
          <tr>
            <th className="text-center">전표번호</th>
            <th>계정</th>
            <th>부서</th>
            <th>프로젝트</th>
            <th>거래처</th>
            <th className="text-right">금액</th>
            <th className="text-center">내역보기</th>
            <th className="text-center">전표번호</th>
            <th>품목</th>
            <th>창고</th>
            <th>프로젝트</th>
            <th>거래처</th>
            <th className="text-right">금액</th>
            <th className="text-center">회계전표일자-No.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} className="ec-empty">불러오는 중…</td></tr>
          ) : !rows || rows.length === 0 ? (
            <tr><td colSpan={14} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key}>
              <td className="text-center">{r.a?.docNo ?? ''}</td>
              <td>{r.a?.account ?? ''}</td>
              <td>{r.a?.dept ?? ''}</td>
              <td>{r.a?.project ?? ''}</td>
              <td>{r.a?.partner ?? ''}</td>
              <td className="text-right">{r.a ? fmtAmountBlank(r.a.amount) : ''}</td>
              <td className="text-center">{r.a ? '내역' : ''}</td>
              <td className="text-center">{r.s ? dateNo(r.s.slipDate, r.s.docNo) : ''}</td>
              <td>{r.s?.itemSummary ?? ''}</td>
              <td>{r.s?.warehouseName ?? ''}</td>
              <td>{r.s?.projectName ?? ''}</td>
              <td>{r.s?.partnerName ?? ''}</td>
              <td className="text-right">{r.s ? fmtAmountBlank(stockAmt(r.s)) : ''}</td>
              <td className="text-center">{r.s?.journalDocNo ? (r.a?.docNo ?? dateNo(r.s.slipDate, r.s.journalDocNo)) : ''}</td>
            </tr>
          ))}
        </tbody>
        {rows && rows.length > 0 && (
          <tfoot>
            <tr className="font-bold">
              <td colSpan={5} className="text-center">합계</td>
              <td className="text-right">{fmtAmountBlank(sumA)}</td>
              <td />
              <td colSpan={5} className="text-center">합계</td>
              <td className="text-right">{fmtAmountBlank(sumS)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
