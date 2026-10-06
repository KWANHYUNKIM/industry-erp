import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { AS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../components/EcReportFrame'
import { AsAggControls, AsAggregateTable, AS_AGG_KEYS, type AsAggLine, type AsAggValue } from '../../features/as/AsAggregate'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { dateNo } from '../../utils/dateNo'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

interface Repair {
  id: number; repairNo: string; repairDate: string; partnerId: number; partnerName: string
  receiptDate: string | null; receiptCharge: string | null; warehouseId: number
  charge: string; repairType: string | null; repairTypeName: string | null; title: string | null; content: string | null
  warehouseName: string | null
  lines: { itemId: number; itemCode: string; itemName: string; itemSpec: string | null; quantity: number }[]; saleAmount: number
}
/** 원본 ◉내역 선택상자(차례 그대로). 거래처별라인별(전송용)은 내보내기용 판이라 두지 않는다. */
const FORMS = ['일별', '월별', '라인별', '전표별', '품목별', '전표별품목별', '거래처별', '담당자별'] as const
type Form = (typeof FORMS)[number]
const REPAIR_TYPES: Record<string, string> = { FREE_EXCHANGE: '무상교환', FREE_REPAIR: '무상수리', PAID_EXCHANGE: '유상교환', PAID_REPAIR: '유상수리', RETURN: '반품' }

/**
 * 재고 II &gt; A/S관리 &gt; A/S수리 &gt; <b>A/S수리현황</b>(E040611) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 구분(<b>내역</b> | 집계, 라인별) · 기준일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택에 직전분기 · 직전반기) ·
 * 접수일자(기본 [사용안함]) · 창고 · 수리담당자 · 접수담당자 · 수리유형 · 거래처 · 품목.
 * 열: 일자-No. · 제목 · 거래처명 · 수리유형명 · 담당자명 · 품목명 · 소모(판매)금액 · 수리내용, 끝에 '합계'. 머리글 이름은 'AS수리현황'.
 *
 * <p>한 줄 = <b>A/S수리 전표</b> 하나(기준일자 = 수리일자). 소모(판매)금액은 그 수리의 판매연결전표 합계,
 * 접수담당자는 불러온 A/S접수의 담당자다. 예전엔 접수의 상태가 완료인 것을 수리로 보고 A/S 소모부품에서 금액을 모았다.
 *
 * <p>[구분] ○집계 — 2026-10-04 실측: 집계조건 창의 후보가 A/S접수현황과 같고(A/S수리 묶음 = 담당자 · 창고 · 관리항목),
 * 담당자로 묶으면 [담당자 | 수량] 최혁순 1.00 · 합계 1.00. 수량은 수리 품목 줄의 수량을 더한다.
 * 머리글은 'A/S수리현황'(내역은 'AS수리현황'), 꼬리에 [P.1] 이 없다. 수리에는 프로젝트가 없어 그 축은 뺀다.
 * ◉내역 — 2026-10-04 원본에 두 줄 수리(A001 1 · QA2FIFO01 2)를 넣고 잼: <b>라인별은 수리 품목 줄마다 한 행</b>
 * (예전 우리는 수리 한 건이 한 행이고 첫 품목만 찍었다 — 그건 원본의 [전표별]이다), 일별은 [일자-No.] 칸에 2026/10/04.
 * 묶는 판은 A/S접수현황과 같다(처음 줄의 값). 소모(판매)금액은 수리 전표의 값이라 그 수리의 첫 줄에만 싣는다 —
 * 판매연결이 든 두 줄 수리는 원본에서 못 재서, 합계가 수리 합과 같게만 맞춘다.
 */
export default function AsRepairStatusPage() {
  const pickers = useCondPickers(['warehouses', 'partners', 'items'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [useReceipt, setUseReceipt] = useState(false)
  const [recFrom, setRecFrom] = useState(init.from)
  const [recTo, setRecTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [charge, setCharge] = useState('')
  const [author, setAuthor] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [rows, setRows] = useState<Repair[]>([])
  const [repairType, setRepairType] = useState('')
  const [loading, setLoading] = useState(true)
  /** 원본 [구분] — ◉내역 ○집계. 집계면 집계조건1 · 2 · 코드포함. */
  const [gubun, setGubun] = useState<'내역' | '집계'>('내역')
  const [form, setForm] = useState<Form>('라인별')
  const [agg, setAgg] = useState<AsAggValue>({ agg1: '', agg2: '', codeIncl: false })
  const mgmt = useItemMgmt()
  const pgroup = usePartnerGroups()
  const [codes, setCodes] = useState<{ wh: Map<number, string>; pa: Map<number, string> }>({ wh: new Map(), pa: new Map() })
  useEffect(() => {
    type C = { id: number; code: string }
    const get = (u: string) => api.get<C[]>(u).then((r) => new Map(r.data.map((x) => [x.id, x.code] as [number, string]))).catch(() => new Map<number, string>())
    Promise.all([get('/warehouses'), get('/partners')]).then(([wh, pa]) => setCodes({ wh, pa }))
  }, [])
  const [error, setError] = useState('')

  /* 소모 줄은 서버가 접수일로 자른다 — 수리가 기간 안이면 접수는 그 끝날 이전이니 끝날까지 받는다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows((await api.get<Repair[]>('/as-repairs', { params: { from, to } })).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const shown = useMemo(() => rows
    .filter((r) => !useReceipt || (r.receiptDate != null && r.receiptDate >= recFrom && r.receiptDate <= recTo))
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !charge || r.charge === charge)
    .filter((r) => !author || (r.receiptCharge ?? '') === author)
    .filter((r) => !repairType || r.repairType === repairType)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !item || r.lines.some((l) => String(l.itemId) === item))
    .sort((a, b) => (a.repairDate < b.repairDate ? -1 : a.repairDate > b.repairDate ? 1 : a.repairNo.localeCompare(b.repairNo))),
  [rows, useReceipt, recFrom, recTo, warehouse, charge, author, repairType, partner, item])
  const total = shown.reduce((a, r) => a + Number(r.saleAmount), 0)
  const charges = useMemo(() => [...new Set(rows.map((r) => r.charge).filter(Boolean))].sort(), [rows])
  const authors = useMemo(() => [...new Set(rows.map((r) => r.receiptCharge).filter(Boolean) as string[])].sort(), [rows])
  /** ○집계가 읽는 줄 — 수리 품목 줄마다 하나. */
  const aggLines: AsAggLine[] = shown.flatMap((r) => r.lines.map((l) => ({
    date: r.repairDate, charge: r.charge ?? '',
    warehouse: [r.warehouseName ?? '', codes.wh.get(r.warehouseId) ?? ''] as [string, string],
    mgmt: mgmt.nameOf(l.itemId) ?? '',
    partner: [r.partnerName, codes.pa.get(r.partnerId) ?? ''] as [string, string], partnerGroup: pgroup.groupOfName(r.partnerName) ?? '',
    itemName: l.itemName, itemSpec: l.itemSpec, itemCode: l.itemCode, itemGroup: mgmt.groupOf(l.itemId) ?? '',
    project: ['', ''] as [string, string], qty: Number(l.quantity),
  })))
  /** ◉내역의 줄 — 라인별이면 수리 품목 줄마다, 아니면 고른 판으로 묶어 처음 줄의 값 + 금액 합. */
  const listRows = useMemo(() => {
    type L = { r: Repair; itemId: number | null; itemName: string; amt: number }
    const lines: L[] = shown.flatMap((r) => (r.lines.length ? r.lines : [null]).map((l, i) => ({
      r, itemId: l?.itemId ?? null, itemName: l?.itemName ?? '', amt: i === 0 ? Number(r.saleAmount) : 0,
    })))
    const keyOf = (x: L) => form === '일별' ? x.r.repairDate : form === '월별' ? x.r.repairDate.slice(0, 7)
      : form === '전표별' ? String(x.r.id) : form === '품목별' ? String(x.itemId) : form === '전표별품목별' ? `${x.r.id}|${x.itemId}`
      : form === '거래처별' ? String(x.r.partnerId) : form === '담당자별' ? x.r.charge ?? '' : ''
    const groups: L[][] = []
    if (form === '라인별') lines.forEach((x) => groups.push([x]))
    else {
      const m = new Map<string, L[]>()
      lines.forEach((x) => { const k = keyOf(x); if (!m.has(k)) { m.set(k, []); groups.push(m.get(k)!) } m.get(k)!.push(x) })
    }
    return groups.map((g, i) => ({
      key: `${form}-${i}`, r: g[0].r, itemName: g[0].itemName, amt: g.reduce((n, x) => n + x.amt, 0),
      dateCell: form === '일별' ? reportDate(g[0].r.repairDate) : form === '월별' ? reportDate(g[0].r.repairDate).slice(0, 7) : dateNo(g[0].r.repairDate, g[0].r.repairNo),
    }))
  }, [shown, form])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'A/S수리현황', [shown.length, gubun, agg.agg1, agg.agg2])

  return (
    <EcListShell
      title="A/S수리현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setUseReceipt(false); setRecFrom(init.from); setRecTo(init.to); setWarehouse(''); setCharge(''); setAuthor(''); setRepairType(''); setPartner(''); setItem('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          <span className="inline-flex flex-wrap items-center gap-[8px]">
            {(['내역', '집계'] as const).map((g) => (
              <label key={g} className="inline-flex items-center gap-[3px]">
                <input type="radio" name="asr-gubun" checked={gubun === g} onChange={() => setGubun(g)} /> {g}
              </label>
            ))}
            {gubun === '내역' ? (
              <select className="ec-input w-[140px]" value={form} onChange={(e) => setForm(e.target.value as Form)}>
                {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )
              : <AsAggControls value={agg} onChange={(p) => setAgg((v) => ({ ...v, ...p }))} keys={AS_AGG_KEYS.filter((k) => k !== '프로젝트')} />}
          </span>
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={AS_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="접수일자">
          <label className="inline-flex items-center gap-[3px] mr-[8px] text-[12.5px]">
            <input type="checkbox" checked={!useReceipt} onChange={(e) => setUseReceipt(!e.target.checked)} /> 사용안함
          </label>
          <input type="date" className="ec-input" value={recFrom} disabled={!useReceipt} onChange={(e) => setRecFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={recTo} disabled={!useReceipt} onChange={(e) => setRecTo(e.target.value)} style={{ width: 145 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="수리담당자" pick>
          <CodePickerField label="수리담당자" hideLabel width={170} emptyLabel="전체" value={charge} onChange={setCharge}
                           items={charges.map((c) => ({ value: c, name: c }))} />
        </EcCond>
        <EcCond label="접수담당자" pick>
          <CodePickerField label="접수담당자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor}
                           items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="수리유형">
          <select className="ec-input w-[130px]" value={repairType} onChange={(e) => setRepairType(e.target.value)}>
            <option value="">전체</option>
            {Object.entries(REPAIR_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
      </ul>

      {gubun === '집계' ? (
        <AsAggregateTable title="A/S수리현황" period={reportPeriod(from, to)} lines={aggLines} value={agg} />
      ) : (<>
      <EcReportHead title="AS수리현황" period={reportPeriod(from, to)} />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>제목</th>
            <th>거래처명</th>
            <th>수리유형명</th>
            <th>담당자명</th>
            <th>품목명</th>
            <th className="text-right">소모(판매)금액</th>
            <th>수리내용</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : listRows.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : listRows.map(({ key, r, itemName, amt, dateCell }) => (
            <tr key={key}>
              <td className="text-center">{dateCell}</td>
              <td>{r.title ?? ''}</td>
              <td>{r.partnerName}</td>
              <td>{r.repairTypeName ?? ''}</td>
              <td>{r.charge}</td>
              <td>{itemName}</td>
              <td className="text-right">{won(amt)}</td>
              <td>{r.content ?? ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'rgb(243, 243, 243)' }}>
            {/* 원본 합계 줄: 소모금액 앞 칸을 다 묶어 가운데 · 바탕 rgb(243,243,243) · 굵게(2026-10-03 실측). */}
            <td colSpan={6} className="text-center">합계</td>
            <td className="text-right">{won(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <EcReportFoot />
      </>)}
    </EcListShell>
  )
}
