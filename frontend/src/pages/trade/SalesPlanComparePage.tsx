import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/** 서버 한 줄 — [표시조건1 · 2] 로 묶은 칸과 예상매출(계획) · 매출(판매 공급가액). */
interface Row {
  key1Code: string | null; key1Name: string | null; key2Code: string | null; key2Name: string | null
  planAmount: number; planQty: number; saleAmount: number; saleQty: number
}

/* 원본 [표시조건] 후보 가운데 우리 마스터에 있는 축. 품목그룹1~3 · 거래처그룹1~2 는 단이 하나뿐이라 뺐다. */
const AXES = [
  { v: '', label: '없음' }, { v: 'EMPLOYEE', label: '담당자' }, { v: 'WAREHOUSE', label: '창고' },
  { v: 'ITEM', label: '품목명' }, { v: 'PARTNER', label: '거래처' }, { v: 'PROJECT', label: '프로젝트' },
] as const
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/* 원본 [차이금액비율] '608536 (%)' — 매출 ÷ 예상 × 100 을 정수로. 예상이 0 이면 0. */
const rate = (sale: number, plan: number) => `${plan ? Math.round((sale / plan) * 100) : 0} (%)`

/**
 * 재고 II &gt; 계획관리 &gt; 매출계획 &gt; <b>매출계획비교표</b>(E040626) — 2026-10-04 loginaa 실측(자료가 든 판).
 *
 * <p>기간 안 <b>계획(예상매출일자)</b>과 기간 안 <b>판매 전부</b>를 [표시조건1 · 2] 축으로 묶어 견준다.
 * 판매는 계획이 있든 없든 다 센다 — 9월: 예상매출금액 97,000(계획 둘) · 매출금액 590,280,000 · 차이금액 −590,183,000 ·
 * 차이금액비율 608536 (%). 매출금액은 판매의 <b>공급가액</b>이다(판매조회 9/4~9/30 금액합계 648,648,000 ÷ 1.1 과 맞물린다).
 * 표시조건이 둘 다 [없음] 이면 합계 한 줄이다. 머리 '매출계획비교표' · 회사명 · 기간, 꼬리 [P.1].
 *
 * <p>예전엔 매출계획 화면 안의 한 판이라 <b>계획 줄마다</b> 그 품목 · 그 달 판매만 붙였다 — 계획이 없는 판매는 어디에도 안 잡혀
 * 합계가 원본과 크게 달랐다. 열: [축1][축2] 예상매출금액 · 매출금액 · 차이금액(= 예상 − 매출) · 차이금액비율, [수량] 을 켜면 수량 넷.
 * [설정]의 코드포함 · 비율(%) · 수량은 원본 기본값(꺼짐 · 켜짐 · 꺼짐)으로 연다. [결재방표시]는 인쇄 판이라 없다.
 */
export default function SalesPlanComparePage() {
  const pickers = useCondPickers(['items', 'partners', 'warehouses', 'employees', 'projects'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [item, setItem] = useState('')
  const [partner, setPartner] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [employee, setEmployee] = useState('')
  const [project, setProject] = useState('')
  const [normal, setNormal] = useState(true)
  const [ret, setRet] = useState(true)
  const [by1, setBy1] = useState('')
  const [by2, setBy2] = useState('')
  const [withCode, setWithCode] = useState(false)
  const [withRate, setWithRate] = useState(true)
  const [withQty, setWithQty] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const saleFlag = normal && ret ? '전체' : normal ? '일반' : ret ? '반품' : '전체'
      const r = await api.get<Row[]>('/sales-plans/compare', {
        params: {
          from, to, saleFlag, by1: by1 || undefined, by2: by2 || undefined,
          itemId: item || undefined, partnerId: partner || undefined, warehouseId: warehouse || undefined,
          employeeId: employee || undefined, projectId: project || undefined,
        },
      })
      setRows(r.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, normal, ret, by1, by2, item, partner, warehouse, employee, project])

  const label = (code: string | null, name: string | null) => (withCode && code ? `${name} (${code})` : name ?? '')
  const axis1 = AXES.find((a) => a.v === by1)
  const axis2 = AXES.find((a) => a.v === by2)
  const total = rows.reduce((s, r) => ({
    planAmount: s.planAmount + r.planAmount, saleAmount: s.saleAmount + r.saleAmount,
    planQty: s.planQty + r.planQty, saleQty: s.saleQty + r.saleQty,
  }), { planAmount: 0, saleAmount: 0, planQty: 0, saleQty: 0 })
  const keyCols = (by1 ? 1 : 0) + (by2 ? 1 : 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '매출계획비교표', [rows.length, keyCols, withRate, withQty])

  return (
    <EcListShell
      title="매출계획비교표"
      onSearch={load}
      searchable={false}
      actions={[{ label: '검색(F8)', primary: true, onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체" value={employee} onChange={setEmployee} items={pickers.employees} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="반품구분">
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={normal && ret} onChange={(e) => { setNormal(e.target.checked); setRet(e.target.checked) }} /> 전체
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={normal} onChange={(e) => setNormal(e.target.checked)} /> 일반
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /> 반품
          </label>
        </EcCond>
        <EcCond label="표시조건">
          <select className="ec-input w-[120px]" value={by1} onChange={(e) => setBy1(e.target.value)}>
            {AXES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
          <select className="ec-input w-[120px] ml-[6px]" value={by2} onChange={(e) => setBy2(e.target.value)}>
            {AXES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
        </EcCond>
        <EcCond label="설정">
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} /> 코드포함
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withRate} onChange={(e) => setWithRate(e.target.checked)} /> 비율(%)
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withQty} onChange={(e) => setWithQty(e.target.checked)} /> 수량
          </label>
        </EcCond>
      </ul>

      <EcReportHead title="매출계획비교표" period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            {by1 && <th>{axis1?.label}</th>}
            {by2 && <th>{axis2?.label}</th>}
            <th className="text-right">예상매출금액</th>
            <th className="text-right">매출금액</th>
            <th className="text-right">차이금액</th>
            {withRate && <th className="text-right">차이금액비율</th>}
            {withQty && <th className="text-right">예상매출수량</th>}
            {withQty && <th className="text-right">매출수량</th>}
            {withQty && <th className="text-right">차이수량</th>}
            {withQty && withRate && <th className="text-right">차이수량비율</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i}>
              {by1 && <td>{label(r.key1Code, r.key1Name)}</td>}
              {by2 && <td>{label(r.key2Code, r.key2Name)}</td>}
              <td className="text-right">{won(r.planAmount)}</td>
              <td className="text-right">{won(r.saleAmount)}</td>
              <td className="text-right">{won(r.planAmount - r.saleAmount)}</td>
              {withRate && <td className="text-right">{rate(r.saleAmount, r.planAmount)}</td>}
              {withQty && <td className="text-right">{r.planQty ? qty2(r.planQty) : ''}</td>}
              {withQty && <td className="text-right">{qty2(r.saleQty)}</td>}
              {withQty && <td className="text-right">{qty2(r.planQty - r.saleQty)}</td>}
              {withQty && withRate && <td className="text-right">{rate(r.saleQty, r.planQty)}</td>}
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              {keyCols > 0 && <td colSpan={keyCols} className="text-center">합계</td>}
              <td className="text-right">{won(total.planAmount)}</td>
              <td className="text-right">{won(total.saleAmount)}</td>
              <td className="text-right">{won(total.planAmount - total.saleAmount)}</td>
              {withRate && <td></td>}
              {withQty && <td className="text-right">{total.planQty ? qty2(total.planQty) : ''}</td>}
              {withQty && <td className="text-right">{qty2(total.saleQty)}</td>}
              {withQty && <td></td>}
              {withQty && withRate && <td></td>}
            </tr>
          </tfoot>
        )}
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
