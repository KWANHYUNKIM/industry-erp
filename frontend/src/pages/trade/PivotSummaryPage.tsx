import { useEffect, useMemo, useState, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 영업관리 > 집계표 (이카운트 E040710)
 * 거래처(또는 품목) × 12개월 매출/매입 금액 피벗 표. 행별·월별 합계 포함.
 * 데이터는 GET /api/sales / /purchases 집계(백엔드 무변경).
 */

type Mode = 'SALE' | 'PURCHASE'
type GroupBy = 'partner' | 'item'

interface PivotRow { key: string; name: string; months: number[]; total: number }

const won = (n: number) => n.toLocaleString('ko-KR')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function PivotSummaryPage() {
  const [year, setYear] = useState<number>(thisYear())
  const [mode, setMode] = useState<Mode>('SALE')
  const [groupBy, setGroupBy] = useState<GroupBy>('partner')
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 집계표의 조건에 <b>[거래처]·[품목]</b> 이 있다(사본 실측).
   * 집계 화면이라 <b>합치기 전</b>에 건다 — 합쳐 놓은 줄을 이름으로 거르면
   * [거래처별]로 볼 때 품목 조건이 아무것도 안 걸린다(그 줄의 이름은 거래처명이다).
   */
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  /*
   * 원본 집계표 조건 차례: <b>메뉴구분</b> · <b>거래유형</b> · 내.외자구분 · 창고 ·
   * 프로젝트 · 관리항목 · 거래처 · 품목 · <b>거래구분</b>.
   *
   * <p>[메뉴구분]은 매출/매입 알약이 이미 하는 일인데 <b>이름표가 없었다.</b>
   * [거래유형]은 과세인가 면세인가, [거래구분]은 일반인가 반품이다 —
   * 둘 다 전표가 들고 있는데 합친 뒤라 거를 수가 없었다. <b>합치기 전에</b> 건다.
   * 반품이 섞여 있으면 금액이 상계돼서, 반품만 따로 보고 싶을 때가 실제로 있다.
   */
  const [taxCond, setTaxCond] = useState<'전체' | '과세' | '면세'>('전체')
  const [kindCond, setKindCond] = useState<'전체' | '일반' | '반품'>('전체')
  const condPick = useCondPickers(['partners', 'items', 'projects', 'warehouses'])

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b] = await Promise.all([api.get<SalesDoc[]>('/sales'), api.get<PurchaseDoc[]>('/purchases')])
      setSales(s.data); setPurchases(b.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const rows = useMemo<PivotRow[]>(() => {
    const docs = mode === 'SALE'
      ? sales.filter((d) => d.saleDate.slice(0, 4) === String(year)).map((d) => ({ date: d.saleDate, partnerId: d.partnerId, partnerName: d.partnerName, projectName: d.projectName, warehouseName: d.warehouseName, taxable: d.taxable, tradeKindName: d.tradeKindName, lines: d.lines }))
      : purchases.filter((d) => d.purchaseDate.slice(0, 4) === String(year)).map((d) => ({ date: d.purchaseDate, partnerId: d.partnerId, partnerName: d.partnerName, projectName: d.projectName, warehouseName: d.warehouseName, taxable: d.taxable, tradeKindName: d.tradeKindName, lines: d.lines }))

    const map = new Map<string, PivotRow>()
    const bump = (key: string, name: string): PivotRow => {
      let r = map.get(key)
      if (!r) { r = { key, name, months: new Array(12).fill(0), total: 0 }; map.set(key, r) }
      return r
    }
    for (const d of docs) {
      if (taxCond !== '전체' && (taxCond === '과세') !== d.taxable) continue
      if (kindCond !== '전체' && d.tradeKindName !== kindCond) continue
      if (partnerCond && !d.partnerName.includes(partnerCond)) continue
      if (warehouseCond && !d.warehouseName.includes(warehouseCond)) continue
      if (projectCond && !(d.projectName ?? '').includes(projectCond)) continue
      if (itemCond && !d.lines.some((l) => l.itemName.includes(itemCond))) continue
      const m = Number(d.date.slice(5, 7)) - 1
      if (groupBy === 'partner') {
        const supply = d.lines.reduce((a, l) => a + l.supplyAmount, 0)
        const r = bump(`P${d.partnerId}`, d.partnerName)
        r.months[m] += supply; r.total += supply
      } else {
        for (const l of d.lines) {
          if (itemCond && !l.itemName.includes(itemCond)) continue
          const r = bump(`I${l.itemId}`, l.itemName)
          r.months[m] += l.supplyAmount; r.total += l.supplyAmount
        }
      }
    }
    const kw = keyword.trim()
    return [...map.values()].filter((r) => !kw || r.name.includes(kw)).sort((a, b) => b.total - a.total)
  }, [sales, purchases, mode, groupBy, year, keyword, partnerCond, itemCond, projectCond, warehouseCond, taxCond, kindCond])

  const colTotals = useMemo(() => {
    const t = new Array(12).fill(0)
    let grand = 0
    for (const r of rows) { r.months.forEach((v, i) => (t[i] += v)); grand += r.total }
    return { months: t, grand }
  }, [rows])

  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]
  const cell: React.CSSProperties = { textAlign: 'right', fontSize: 11.5, padding: '4px 6px', whiteSpace: 'nowrap' }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '집계표', [])

  return (
    <EcListShell
      title="집계표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">거래처/품목 × 월 매출·매입 금액 피벗. 공급가액 기준, 금액 큰 행 순.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>메뉴구분</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['SALE', 'PURCHASE'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: mode === m ? 'var(--ec-blue)' : '#fff', color: mode === m ? '#fff' : '#3a4453', fontWeight: mode === m ? 700 : 400,
            }}>{m === 'SALE' ? '매출' : '매입'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['partner', 'item'] as const).map((g) => (
            <button key={g} onClick={() => setGroupBy(g)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: groupBy === g ? '#3c4553' : '#fff', color: groupBy === g ? '#fff' : '#3a4453', fontWeight: groupBy === g ? 700 : 400,
            }}>{g === 'partner' ? '거래처별' : '품목별'}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>거래유형</span>
        <select className="ec-input" value={taxCond} style={{ width: 90 }}
                onChange={(e) => setTaxCond(e.target.value as '전체' | '과세' | '면세')}>
          <option>전체</option><option>과세</option><option>면세</option>
        </select>
        {/* 원본 조건 차례: … 창고 · <b>프로젝트</b> · … · 거래처 · 품목 — 프로젝트가 거래처보다 앞이다. */}
        <CodePickerField label="창고" width={150} emptyLabel="전체"
                         value={warehouseCond} onChange={setWarehouseCond} items={condPick.warehouses} />
        <CodePickerField label="프로젝트" width={150} emptyLabel="전체"
                         value={projectCond} onChange={setProjectCond} items={condPick.projects} />
        <CodePickerField label="거래처" width={150} emptyLabel="전체"
                         value={partnerCond} onChange={setPartnerCond} items={condPick.partners} />
        <CodePickerField label="품목" width={150} emptyLabel="전체"
                         value={itemCond} onChange={setItemCond} items={condPick.items} />
        {/* 원본 조건 차례의 맨 뒤 [거래구분] — 일반인가 반품인가. */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>거래구분</span>
        <select className="ec-input" value={kindCond} style={{ width: 90 }}
                onChange={(e) => setKindCond(e.target.value as '전체' | '일반' | '반품')}>
          <option>전체</option><option>일반</option><option>반품</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>총계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(colTotals.grand)}</b></span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table ref={tableRef} className="w-full text-left" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: '#f5f7fa', minWidth: 140 }}>{groupBy === 'partner' ? '거래처' : '품목'}</th>
              {MONTHS.map((m) => <th key={m} style={{ ...cell, fontWeight: 700 }}>{m}월</th>)}
              <th style={{ ...cell, fontWeight: 700, color: 'var(--ec-blue)' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key}>
                <td style={{ position: 'sticky', left: 0, background: '#fff', fontWeight: 600 }}>{r.name}</td>
                {r.months.map((v, i) => <td key={i} style={{ ...cell, color: v ? '#3c4553' : '#d0d5db' }}>{v ? won(v) : '-'}</td>)}
                <td style={{ ...cell, fontWeight: 700, color: 'var(--ec-blue)' }}>{won(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td style={{ position: 'sticky', left: 0, background: '#f7f9fb' }}>합계</td>
                {colTotals.months.map((v, i) => <td key={i} style={cell}>{v ? won(v) : '-'}</td>)}
                <td style={{ ...cell, color: 'var(--ec-blue)' }}>{won(colTotals.grand)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
