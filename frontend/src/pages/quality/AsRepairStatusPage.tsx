import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { AS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

interface AsRow {
  id: number; asNo: string; partnerId: number; partnerName: string; itemId: number; itemName: string
  receiptDate: string; title: string | null; charge: string | null
  warehouseId: number | null
  status: string; doneDate: string | null; repairNote: string | null; createdBy: string | null
}
interface ConsumptionLine { asNo: string; supplyAmount: number }

/**
 * 재고 II &gt; A/S관리 &gt; A/S수리 &gt; <b>A/S수리현황</b>(E040611) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 구분(<b>내역</b> | 집계, 라인별) · 기준일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택에 직전분기 · 직전반기) ·
 * 접수일자(기본 [사용안함]) · 창고 · 수리담당자 · 접수담당자 · 수리유형 · 거래처 · 품목.
 * 열: 일자-No. · 제목 · 거래처명 · 수리유형명 · 담당자명 · 품목명 · 소모(판매)금액 · 수리내용, 끝에 '합계'. 머리글 이름은 'AS수리현황'.
 *
 * <p>기준일자는 <b>수리한 날</b>(완료일)이다 — 접수는 지난달이어도 이번 달에 고쳤으면 여기 뜬다.
 * 우리는 수리를 따로 전표로 두지 않고 A/S 한 건이 접수 → 완료로 넘어가므로, 완료일이 있는 A/S 가 수리 한 건이다.
 * 소모(판매)금액은 그 A/S 에 쓴 부품(A/S 소모)의 공급가 합이다.
 * [수리유형]은 우리 A/S 가 유상 · 무상교환 같은 유형을 들지 않아 조건도 열도 두지 않았다.
 * [구분]의 [집계]는 원본 집계 판을 못 재서 내역 한 장만 세운다.
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
  const [rows, setRows] = useState<AsRow[]>([])
  const [used, setUsed] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 소모 줄은 서버가 접수일로 자른다 — 수리가 기간 안이면 접수는 그 끝날 이전이니 끝날까지 받는다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, c] = await Promise.all([
        api.get<AsRow[]>('/as-requests', { params: { doneFrom: from, doneTo: to } }),
        api.get<ConsumptionLine[]>('/as-requests/parts/consumption/lines', { params: { to } }),
      ])
      setRows(a.data)
      const m = new Map<string, number>()
      for (const l of c.data) m.set(l.asNo, (m.get(l.asNo) ?? 0) + Number(l.supplyAmount))
      setUsed(m)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const shown = useMemo(() => rows
    .filter((r) => !!r.doneDate && r.doneDate >= from && r.doneDate <= to)
    .filter((r) => !useReceipt || (r.receiptDate >= recFrom && r.receiptDate <= recTo))
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !charge || (r.charge ?? '') === charge)
    .filter((r) => !author || (r.createdBy ?? '') === author)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !item || String(r.itemId) === item)
    .sort((a, b) => ((a.doneDate ?? '') < (b.doneDate ?? '') ? -1 : (a.doneDate ?? '') > (b.doneDate ?? '') ? 1 : a.asNo.localeCompare(b.asNo))),
  [rows, from, to, useReceipt, recFrom, recTo, warehouse, charge, author, partner, item])
  const total = shown.reduce((a, r) => a + (used.get(r.asNo) ?? 0), 0)
  const charges = useMemo(() => [...new Set(rows.map((r) => r.charge).filter(Boolean) as string[])].sort(), [rows])
  const authors = useMemo(() => [...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort(), [rows])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'A/S수리현황', [shown.length])

  return (
    <EcListShell
      title="A/S수리현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setUseReceipt(false); setRecFrom(init.from); setRecTo(init.to); setWarehouse(''); setCharge(''); setAuthor(''); setPartner(''); setItem('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
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
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
      </ul>

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">
        AS수리현황 <span className="font-normal text-ec-hint">{dateText(from)} ~ {dateText(to)}</span>
      </h3>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>제목</th>
            <th>거래처명</th>
            <th>담당자명</th>
            <th>품목명</th>
            <th className="text-right">소모(판매)금액</th>
            <th>수리내용</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">{dateText(r.doneDate ?? '')} {r.asNo}</td>
              <td>{r.title ?? ''}</td>
              <td>{r.partnerName}</td>
              <td>{r.charge ?? ''}</td>
              <td>{r.itemName}</td>
              <td className="text-right">{won(used.get(r.asNo) ?? 0)}</td>
              <td>{r.repairNote ?? ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'rgb(243, 243, 243)' }}>
            {/* 원본 합계 줄: 소모금액 앞 칸을 다 묶어 가운데 · 바탕 rgb(243,243,243) · 굵게(2026-10-03 실측). */}
            <td colSpan={5} className="text-center">합계</td>
            <td className="text-right">{won(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
