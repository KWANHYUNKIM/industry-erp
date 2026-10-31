import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import Modal from '../../../components/Modal'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { EcReportHead, reportPeriod } from '../../../components/EcReportFrame'
import { useCondPickers } from '../../../utils/useCondPickers'
import { dateText } from '../../../utils/dateText'
import AccountingReflectionPage from './AccountingReflectionPage'
import EcDateInput from '../../../components/ui/EcDateInput'
import { fmtNumber } from '../../../utils/format'

/**
 * 판매일괄회계반영 (원본 E040215, 2026-10-22 loginaa 실측 — plans/재고1.md 97행).
 * 구매일괄회계반영 · 회계미반영현황은 AccountingReflectionPage 가 그대로 맡는다(구매 쪽 원본 값은 아직 모른다).
 *
 * 조건: 구분(◉거래처별/○전표별) · 기준일자(전월) · 창고 · 거래처 · 품목 · 프로젝트 · 담당자 · 거래처관리담당자 ·
 * 거래유형(선택상자 전체 · 부가세율 적용★ · 부가세율 미적용 — 2026-10-22 재기: '부가세율 적용' 은 따로 된 조건이 아니라 이 칸의 기본값) ·
 * 내.외자구분(전체/◉내자/외자) · 거래구분(◉전체/일반/반품 — 기타 없음) · 기타 □거래처코드없는자료인쇄.
 * 격자: 체크 · 거래일자(전표별은 '2026/10/22-6') · 거래처명 · 거래가액 · 조정(입력) · 공급가액 · 부가세 · 합계 · 품목요약 · 부가세유형 · 일부반영(링크) + 합계 줄.
 * [조정] 100 → 공급가액 = 거래가액 − 조정, 부가세 = 공급가액의 10%, 합계 = 둘의 합.
 * [매출전표 I] → '매출전표 I' 창(일자 · 연결거래 없음 · 부가세유형 · 거래처 · 공급가액 · 부가세 · 적요(품목요약) · 매출계정 4049 제품매출 ·
 * 입금계좌 1089 외상매출금 · 수수료 0) [저장(F8)] — 조정이 있으면 원본 확인 글('기타할인등차액') → 말 없이 닫히고 그 줄이 빠진다.
 * [일부반영] → '일괄회계반영' 창 '매출 세금계산서 미청구 리스트'(거래처명 · 일자-No. · 품목명[규격] · 수량 · 단가 · 공급가액 · 부가세 · 합계 · 적요) [매출전표 I] [닫기].
 */
interface SlipLine {
  itemId: number
  itemName: string
  spec: string | null
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  remark: string | null
  lineId: number | null
  reflected: boolean
}

interface Slip {
  id: number
  docNo: string
  slipDate: string
  partnerId: number
  partnerName: string
  warehouseId: number | null
  projectId: number | null
  employeeName: string | null
  partnerManager: string | null
  itemSummary: string
  lines: SlipLine[]
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  vatType: string
  tradeKind: string
  reflected: boolean
}

interface Row {
  key: string
  date: string
  docNo: string | null
  partnerId: number
  partnerName: string
  ids: number[]
  /** [일부반영] 으로 고른 판매 줄 id — 없으면 그 판매들의 남은 줄 전부. */
  lineIds?: number[]
  slips: Slip[]
  supply: number
  vat: number
  items: string
  vatTypes: Set<string>
}

const SALES_VAT_TYPES = ['세금계산서', '영세율', '계산서', '소매매출', '수출', '카드매출', '계산서(고정자산)', '세.계(고정자산)',
  '소매(면세)', '카드매출(면세)', '현금영수증(면세)', '현금영수증', '매입자발행세금계산서', '영세율(기타)', '기타매출']
const vatOptions = SALES_VAT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)
const num = (v: string | undefined) => Number(String(v ?? '').replace(/,/g, '')) || 0
const initP = periodOf('전월')!
/** 원본 [거래유형] 선택상자 — 판매입력의 거래유형과 같은 이름(부가세율 적용 = 과세 · 미적용 = 면세). */
const TRADE_TYPES = [['', '전체'], ['과세', '부가세율 적용'], ['면세', '부가세율 미적용']] as const
const seqOf = (docNo: string) => { const t = docNo.split('-').pop() ?? ''; return String(Number(t) || t) }
const MISMATCH = "판매전표와 회계전표의 정보가 서로 다릅니다. 정보가 다른 경우 거래처관리대장 조회시 '기타할인등차액'이 발생할 수 있습니다. 계속 저장하겠습니까?\n- 합계금액"

function Pills<T extends string>({ values, value, onChange, label }: {
  values: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string
}) {
  return (
    <div className="ec-pills">
      {values.map((v) => (
        <button key={v} type="button" className={`ec-pill no-ec${value === v ? ' active' : ''}`}
                onClick={() => onChange(v)}>{label(v)}</button>
      ))}
    </div>
  )
}

function SalesBatch() {
  const pickers = useCondPickers(['partners', 'warehouses', 'projects', 'items', 'employees'])
  const [slips, setSlips] = useState<Slip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'거래처별' | '전표별'>('거래처별')
  const blank = { from: initP.from, to: initP.to, warehouse: '', partner: '', item: '', project: '', employee: '',
    partnerManager: '', vatType: '과세', domestic: '내자', tradeKind: '', noCodePrint: false }
  const [cond, setCond] = useState(blank)
  const setC = (patch: Partial<typeof blank>) => setCond((c) => ({ ...c, ...patch }))
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [rowVat, setRowVat] = useState<Record<string, string>>({})
  const [adjust, setAdjust] = useState<Record<string, string>>({})
  // [일부반영] 창 — 그 줄 전표의 품목 줄. 고른 전표만 [매출전표 I] 로 넘긴다.
  const [detail, setDetail] = useState<Row | null>(null)
  const [detailPick, setDetailPick] = useState<Set<number>>(new Set()) // 고른 판매 줄(lineId)
  // [매출전표 I] 창 — 고른 줄을 하나씩
  const [queue, setQueue] = useState<Row[]>([])
  const [slipVat, setSlipVat] = useState('')
  const [slipError, setSlipError] = useState('')
  // 창에서 고치는 값 — 일자 · 부서 · 프로젝트 · 거래처 · 적요 (원본은 모두 입력 칸)
  const [slipForm, setSlipForm] = useState({ date: '', dept: '', project: '', partner: '', note: '' })
  const [depts, setDepts] = useState<{ value: string; code: string; name: string }[]>([])
  useEffect(() => {
    api.get<{ id: number; code: string; name: string }[]>('/departments')
      .then((r) => setDepts(r.data.map((d) => ({ value: String(d.id), code: d.code, name: d.name })))).catch(() => setDepts([]))
  }, [])

  async function load(): Promise<void> {
    setLoading(true); setError('')
    try {
      const res = await api.get<Slip[]>('/accounting-reflection', {
        params: { kind: 'SALES', onlyUnreflected: true, from: cond.from || undefined, to: cond.to || undefined },
      })
      setSlips(res.data)
    } catch (err) {
      setError(extractErrorMessage(err)); setSlips([])
    } finally { setLoading(false) }
  }
  // 원본 빠른선택(금일 · 전일 …)은 누르면 그 기간으로 바로 검색한다 — 기간이 바뀌면 다시 받는다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [cond.from, cond.to])

  const rows = useMemo<Row[]>(() => {
    const f = slips
      .filter((s) => !s.reflected)
      // □거래처코드없는자료인쇄 — 끄면 거래처코드가 없는 전표는 뺀다(우리 판매는 거래처가 필수라 늘 있다).
      .filter((s) => cond.noCodePrint || s.partnerId != null)
      .filter((s) => !cond.from || s.slipDate >= cond.from)
      .filter((s) => !cond.to || s.slipDate <= cond.to)
      .filter((s) => !cond.partner || String(s.partnerId) === cond.partner)
      .filter((s) => !cond.warehouse || String(s.warehouseId) === cond.warehouse)
      .filter((s) => !cond.project || String(s.projectId) === cond.project)
      .filter((s) => !cond.item || (s.lines ?? []).some((l) => String(l.itemId) === cond.item))
      .filter((s) => !cond.employee || (s.employeeName ?? '').includes(cond.employee))
      .filter((s) => !cond.partnerManager || (s.partnerManager ?? '').includes(cond.partnerManager))
      .filter((s) => !cond.vatType || s.vatType === cond.vatType)
      .filter(() => cond.domestic !== '외자') // 우리 판매전표는 모두 내자다
      .filter((s) => !cond.tradeKind || s.tradeKind === cond.tradeKind)
    const m = new Map<string, Row>()
    for (const s of f) {
      const key = mode === '거래처별' ? `p${s.partnerId}` : `s${s.id}`
      const cur = m.get(key) ?? { key, date: s.slipDate, docNo: mode === '전표별' ? s.docNo : null, partnerId: s.partnerId,
        partnerName: s.partnerName, ids: [], slips: [], supply: 0, vat: 0, items: s.itemSummary, vatTypes: new Set<string>() }
      cur.ids.push(s.id); cur.slips.push(s)
      // 거래처별은 마지막 거래일이 아니라 기준일자 끝(원본 실측: 9월 검색 → 모두 09/30, 10/01~10/23 → 모두 10/23). 이 날짜가 회계전표 일자로도 간다.
      if (mode === '거래처별' && cond.to) cur.date = cond.to
      else if (s.slipDate > cur.date) cur.date = s.slipDate
      cur.supply += s.supplyAmount; cur.vat += s.vatAmount
      cur.vatTypes.add(s.vatType)
      m.set(key, cur)
    }
    // 원본 품목요약은 묶인 전표의 품목 줄 전부로 센다 — 같은 거래처 2건(줄 2 + 1) → '코카콜라 외 2건'(2026-10-22 실측).
    for (const r of m.values()) {
      const ls = r.slips.flatMap((s) => s.lines ?? [])
      if (r.slips.length > 1 && ls.length > 0) r.items = ls.length > 1 ? `${ls[0].itemName} 외 ${ls.length - 1}건` : ls[0].itemName
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.partnerName.localeCompare(b.partnerName)))
  }, [slips, cond, mode])

  const vatOf = (r: Row) => rowVat[r.key] ?? (r.vatTypes.size === 1 && r.vatTypes.has('면세') ? '계산서' : '세금계산서')
  /** 원본 [조정]: 공급가액 = 거래가액 − 조정, 부가세 = 공급가액의 10%(부가세가 없던 줄은 0), 합계 = 둘의 합. */
  const amountsOf = (r: Row) => {
    const adj = num(adjust[r.key])
    if (!adj) return { adj, supply: r.supply, vat: r.vat }
    const supply = r.supply - adj
    return { adj, supply, vat: r.vat ? Math.round(supply / 10) : 0 }
  }
  const sum = rows.reduce((t, r) => {
    const a = amountsOf(r)
    return { trade: t.trade + r.supply, adj: t.adj + a.adj, supply: t.supply + a.supply, vat: t.vat + a.vat }
  }, { trade: 0, adj: 0, supply: 0, vat: 0 })

  function toggle(k: string) {
    setChecked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }

  function openSlips(picked: Row[]) {
    if (picked.length === 0) { void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    setSlipError(''); setQueue(picked); setSlipVat(vatOf(picked[0])); initSlip(picked[0])
  }
  /** '매출전표 I' 창 적요 기본값 — 품목명 + 규격('포장김치1kg', 원본 11/28-4 실측 2026-10-29), 줄이 여럿이면 '… 외 n건'. */
  function noteOf(r: Row) {
    const all = r.slips.flatMap((s) => s.lines ?? [])
    const ls = r.lineIds ? all.filter((l) => r.lineIds!.includes(l.lineId ?? -1)) : all.filter((l) => !l.reflected)
    if (ls.length === 0) return r.items
    const first = `${ls[0].itemName}${ls[0].spec ?? ''}`
    return ls.length > 1 ? `${first} 외 ${ls.length - 1}건` : first
  }
  function initSlip(r: Row) {
    setSlipForm({ date: r.date, dept: '', project: '', partner: String(r.partnerId), note: noteOf(r) })
  }

  /** '매출전표 I' 창 [저장(F8)] — 그 줄의 판매전표를 분개로 넘긴다. 조정이 있으면 원본 확인 글을 먼저 띄운다. 저장하면 말 없이 닫힌다. */
  async function saveSlip() {
    const r = queue[0]
    if (!r) return
    const a = amountsOf(r)
    if (a.adj && !(await ecConfirm(MISMATCH))) return
    setSlipError('')
    try {
      // 거래처별 여러 판매 → 회계전표 한 장. 창에서 고친 값이 분개로 간다(공급가액을 고치면 부가세는 서버가 10% 로 다시 매긴다).
      await api.post('/accounting-reflection/reflect-sales-batch', {
        salesIds: r.ids, lineIds: r.lineIds, entryDate: slipForm.date || undefined,
        departmentId: slipForm.dept ? Number(slipForm.dept) : undefined,
        projectId: slipForm.project ? Number(slipForm.project) : undefined,
        partnerId: slipForm.partner && slipForm.partner !== String(r.partnerId) ? Number(slipForm.partner) : undefined,
        note: slipForm.note && slipForm.note !== noteOf(r) ? slipForm.note : undefined,
        vatType: slipVat, supplyAmount: a.adj ? a.supply : undefined })
      const rest = queue.slice(1)
      setQueue(rest)
      if (rest[0]) { setSlipVat(vatOf(rest[0])); initSlip(rest[0]) }
      setChecked(new Set()); setDetail(null)
      setAdjust((m) => { const n = { ...m }; delete n[r.key]; return n })
      await load()
    } catch (err) { setSlipError(extractErrorMessage(err)) }
  }

  const reset = () => { setCond(blank); setMode('거래처별'); setChecked(new Set()); setAdjust({}) }
  const cur = queue[0]
  const curAmt = cur ? amountsOf(cur) : null

  return (
    <EcListShell
      title="판매일괄회계반영"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '다시작성', onClick: reset },
        { label: '매출전표 I', selected: checked.size, onClick:() => openSlips(rows.filter((r) => checked.has(r.key))) },
      ]}
    >
      <EcStatusPanel from={cond.from} to={cond.to} onPeriod={(r) => setC({ from: r.from, to: r.to })}
                     picks={INQUIRY_PICKS} dateLabel="기준일자"
                     modes={['거래처별', '전표별']} mode={mode}
                     onModeChange={(v) => { setMode(v as '거래처별' | '전표별'); setChecked(new Set()); setAdjust({}) }}>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={cond.warehouse}
                           onChange={(v) => setC({ warehouse: v })} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체" value={cond.partner}
                           onChange={(v) => setC({ partner: v })} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체" value={cond.item}
                           onChange={(v) => setC({ item: v })} items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={cond.project}
                           onChange={(v) => setC({ project: v })} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체" value={cond.employee}
                           onChange={(v) => setC({ employee: v })} items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} emptyLabel="전체" value={cond.partnerManager}
                           onChange={(v) => setC({ partnerManager: v })} items={pickers.employees} />
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input w-[160px]" aria-label="거래유형" value={cond.vatType} onChange={(e) => setC({ vatType: e.target.value })}>
            {TRADE_TYPES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
          </select>
        </EcCond>
        <EcCond label="내.외자구분">
          <Pills values={['', '내자', '외자'] as const} value={cond.domestic as '' | '내자' | '외자'}
                 onChange={(v) => setC({ domestic: v })} label={(v) => v || '전체'} />
        </EcCond>
        <EcCond label="거래구분">
          <Pills values={['', '일반', '반품'] as const} value={cond.tradeKind as '' | '일반' | '반품'}
                 onChange={(v) => setC({ tradeKind: v })} label={(v) => v || '전체'} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={cond.noCodePrint} onChange={(e) => setC({ noCodePrint: e.target.checked })} />
            거래처코드없는자료인쇄
          </label>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="ec-grid w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[110px]">거래일자</th>
            <th>거래처명</th>
            <th className="w-[120px] text-right">거래가액</th>
            <th className="w-[90px] text-right">조정</th>
            <th className="w-[120px] text-right">공급가액</th>
            <th className="w-[100px] text-right">부가세</th>
            <th className="w-[120px] text-right">합계</th>
            <th>품목요약</th>
            <th className="w-[130px] text-center">부가세유형</th>
            <th className="w-[80px] text-center">일부반영</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => {
            const a = amountsOf(r)
            return (
              <tr key={r.key}>
                <td className="text-center"><input type="checkbox" checked={checked.has(r.key)} onChange={() => toggle(r.key)} /></td>
                <td>{r.docNo ? <span className="ec-link">{dateText(r.date)}-{seqOf(r.docNo)}</span> : dateText(r.date)}</td>
                <td>{r.partnerName}</td>
                <td className="text-right">{fmtNumber(r.supply)}</td>
                <td className="text-right">
                  <input className="ec-input w-full text-right" aria-label="조정" inputMode="numeric"
                         value={adjust[r.key] ?? '0'} onChange={(e) => setAdjust((m) => ({ ...m, [r.key]: e.target.value }))} />
                </td>
                <td className="text-right">{fmtNumber(a.supply)}</td>
                <td className="text-right">{fmtNumber(a.vat)}</td>
                <td className="text-right">{fmtNumber(a.supply + a.vat)}</td>
                <td>{r.items}</td>
                <td className="text-center">
                  <select className="ec-input w-full" aria-label="부가세유형" value={vatOf(r)}
                          onChange={(e) => setRowVat((m) => ({ ...m, [r.key]: e.target.value }))}>{vatOptions}</select>
                </td>
                <td className="text-center">
                  <button type="button" className="ec-link" onClick={() => { setDetail(r); setDetailPick(new Set(r.slips.flatMap((s) => s.lines.map((l) => l.lineId ?? -1)))) }}>일부반영</button>
                </td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={3}></td>
              <td className="text-right">{fmtNumber(sum.trade)}</td>
              <td className="text-right">{fmtNumber(sum.adj)}</td>
              <td className="text-right">{fmtNumber(sum.supply)}</td>
              <td className="text-right">{fmtNumber(sum.vat)}</td>
              <td className="text-right">{fmtNumber(sum.supply + sum.vat)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        )}
      </table>

      <Modal open={detail != null} title="일괄회계반영" width={980} error={slipError} onClose={() => setDetail(null)}>
        {detail && <>
          <EcReportHead title={`매출 ${vatOf(detail)} 미청구 리스트`} period={reportPeriod(cond.from, cond.to)} sub={detail.partnerName} />
          <table className="ec-report w-full">
            <thead>
              <tr>
                <th className="w-[25px]"></th>
                <th>거래처명</th><th className="text-center">일자-No.</th><th>품목명[규격]</th>
                <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th>
                <th className="text-right">부가세</th><th className="text-right">합계</th><th>적요</th>
              </tr>
            </thead>
            <tbody>
              {detail.slips.flatMap((s) => s.lines.map((l, i) => (
                <tr key={`${s.id}-${i}`}>
                  <td className="text-center">
                    <input type="checkbox" aria-label={`${s.docNo} ${i + 1}번째 줄 선택`} checked={detailPick.has(l.lineId ?? -1)}
                           onChange={() => setDetailPick((p) => { const n = new Set(p); const k = l.lineId ?? -1; if (n.has(k)) n.delete(k); else n.add(k); return n })} />
                  </td>
                  <td>{s.partnerName}</td>
                  <td className="text-center">{dateText(s.slipDate)} -{seqOf(s.docNo)}</td>
                  <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
                  <td className="text-right">{fmtNumber(Number(l.quantity))}</td>
                  <td className="text-right">{fmtNumber(Number(l.unitPrice))}</td>
                  <td className="text-right">{fmtNumber(Number(l.supplyAmount))}</td>
                  <td className="text-right">{fmtNumber(Number(l.vatAmount))}</td>
                  <td className="text-right">{fmtNumber(Number(l.supplyAmount) + Number(l.vatAmount))}</td>
                  <td>{l.remark ?? ''}</td>
                </tr>
              )))}
              <tr className="ec-total">
                <td />
                <td colSpan={3} className="text-center">합계</td>
                <td className="text-right">{fmtNumber(detail.slips.reduce((t, s) => t + s.lines.reduce((u, l) => u + Number(l.quantity), 0), 0))}</td>
                <td className="text-right">{fmtNumber(detail.slips.reduce((t, s) => t + s.lines.reduce((u, l) => u + Number(l.unitPrice), 0), 0))}</td>
                <td className="text-right">{fmtNumber(detail.supply)}</td>
                <td className="text-right">{fmtNumber(detail.vat)}</td>
                <td className="text-right">{fmtNumber(detail.supply + detail.vat)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => {
              // 품목 줄마다 고른다 — 고른 줄이 있는 판매만, 그 줄들의 금액으로 넘긴다.
              const ss = detail.slips
                .map((s) => ({ ...s, lines: s.lines.filter((l) => detailPick.has(l.lineId ?? -1)) }))
                .filter((s) => s.lines.length > 0)
              const ls = ss.flatMap((s) => s.lines)
              const sup = ls.reduce((t, l) => t + Number(l.supplyAmount), 0)
              const vat = ls.reduce((t, l) => t + Number(l.vatAmount), 0)
              openSlips(ss.length === 0 ? [] : [{ ...detail, key: `${detail.key}:part`, ids: ss.map((s) => s.id),
                lineIds: ls.map((l) => l.lineId as number), slips: ss, supply: sup, vat,
                items: ls.length > 1 ? `${ls[0].itemName} 외 ${ls.length - 1}건` : ls[0].itemName }])
            }}>매출전표 I</button>
            <button type="button" className="ec-btn" onClick={() => setDetail(null)}>닫기</button>
          </div>
        </>}
      </Modal>

      <Modal open={cur != null} title="매출전표 I" width={760} error={slipError} onClose={() => setQueue([])}>
        {cur && curAmt && <>
          <ul className="ec-form mb-[8px]">
            <EcCond label="일자-No." span={2}>
              <EcDateInput className="ec-input w-[150px]" aria-label="매출전표 일자" value={slipForm.date} onChange={(e) => setSlipForm((f) => ({ ...f, date: e.target.value }))} />
            </EcCond>
            <EcCond label="연결거래" span={2}><span className="ec-link">없음</span></EcCond>
            <EcCond label="부가세유형" span={2}>
              <select className="ec-input w-full" aria-label="매출전표 부가세유형" value={slipVat} onChange={(e) => setSlipVat(e.target.value)}>{vatOptions}</select>
            </EcCond>
            <EcCond label="부서" span={2} pick>
              <CodePickerField label="부서" hideLabel width={200} emptyLabel="" value={slipForm.dept}
                               onChange={(v) => setSlipForm((f) => ({ ...f, dept: v }))} items={depts} />
            </EcCond>
            <EcCond label="프로젝트" span={2} pick>
              <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="" value={slipForm.project}
                               onChange={(v) => setSlipForm((f) => ({ ...f, project: v }))} items={pickers.projects} />
            </EcCond>
            <EcCond label="거래처" span={2} pick>
              <CodePickerField label="거래처" hideLabel width={200} emptyLabel="" value={slipForm.partner}
                               onChange={(v) => setSlipForm((f) => ({ ...f, partner: v }))} items={pickers.partners} />
            </EcCond>
            {/* 원본 공급가액은 입력 칸 — 바꾸면 부가세가 10% 로 다시 매겨진다(5,000 → 4,000 · 부가세 400). 우리는 그 차이를 [조정]으로 넘긴다. */}
            <EcCond label="공급가액">
              <input className="ec-input w-full text-right" aria-label="매출전표 공급가액" inputMode="numeric" value={fmtNumber(curAmt.supply)}
                     onChange={(e) => setAdjust((m) => ({ ...m, [cur.key]: String(cur.supply - num(e.target.value)) }))} />
            </EcCond>
            <EcCond label="부가세"><span aria-label="매출전표 부가세">{fmtNumber(curAmt.vat)}</span></EcCond>
            <EcCond label="적요" span={2}>
              <input className="ec-input w-full" aria-label="매출전표 적요" maxLength={200} value={slipForm.note}
                     onChange={(e) => setSlipForm((f) => ({ ...f, note: e.target.value }))} />
            </EcCond>
            <EcCond label="매출계정"><span>4049 제품매출</span></EcCond>
            <EcCond label="입금계좌"><span>1089 외상매출금</span></EcCond>
            <EcCond label="수수료"><span>0</span></EcCond>
          </ul>
          <div className="flex gap-[4px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveSlip()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setQueue([])}>닫기</button>
          </div>
        </>}
      </Modal>
    </EcListShell>
  )
}

/** 판매일괄회계반영(?view=batch, 구매 아님)만 새 화면. 나머지는 예전 화면 그대로. */
export default function SalesBatchReflectionPage() {
  const [params] = useSearchParams()
  const isSalesBatch = params.get('kind') !== 'purchase' && params.get('view') === 'batch'
  return isSalesBatch ? <SalesBatch /> : <AccountingReflectionPage />
}
