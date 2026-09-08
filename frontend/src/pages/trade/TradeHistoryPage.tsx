import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import CodePickerField from '../../components/CodePickerField'
import { partnerCodeItems } from '../../utils/codeItems'
import { dateText } from '../../utils/dateText'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'

/**
 * 영업관리 > 거래이력조회 = <b>전표이력조회</b> (E040716)
 *
 * <p>2026-09-08 에 원본을 열어 보니 <b>메뉴 이름과 화면 제목이 다르다</b> —
 * 사이트맵에는 [거래이력조회] 라 적혀 있는데 열면 제목이 <b>[전표이력조회]</b> 다.
 * 같은 화면이 맞다: 사본에 적힌 여덟(구분·작업시간·전표일자·메뉴·작업자·행위·기타·적용양식)이
 * 이 화면 <b>스물일곱</b>의 정확한 부분집합이다. 사본은 메뉴 이름 쪽을 적어 두었다.
 * 거래처를 중심으로 판매·구매 전표를 한 타임라인에 통합해 보는 화면.
 * 데이터는 GET /api/sales + GET /api/purchases 를 그대로 합쳐 쓴다(백엔드 무변경).
 *
 * 이카운트 원본은 수금·지급까지 포함한 채권/채무 잔액 원장이지만, 우리는 수금/지급 전표를
 * 이 뷰에 실을 정산 소스를 배선하지 않았으므로 <b>판매·구매 전표 이력</b>으로 한정한다
 * (값 없는 잔액 컬럼을 흉내내지 않는다). 잔액 대장은 거래처관리대장(PartnerLedgerPage)이 담당.
 */

type Kind = 'SALE' | 'PURCHASE'
const KIND_COLOR: Record<Kind, { bg: string; fg: string; label: string }> = {
  SALE: { bg: '#eef4ff', fg: 'var(--ec-blue)', label: '판매' },
  PURCHASE: { bg: '#fdf3ea', fg: '#a5561b', label: '구매' },
}

interface Row {
  key: string
  kind: Kind
  date: string
  docNo: string
  partnerId: number
  partnerName: string
  warehouseName: string
  itemSummary: string
  qty: number
  supply: number
  vat: number
  total: number
  employeeName: string | null
  /** 원본 조건 [품목코드]·[품목구분]·[품목그룹1] 이 보는 값. 줄이 여럿이면 하나라도 걸리면 남는다. */
  itemIds: number[]
  itemCodes: string[]
  itemCategories: string[]
  /** 원본 조건 [프로젝트]. 응답에 진작 오는데 이 화면이 안 받아 두고 있었다. */
  projectName: string | null
}

const won = (n: number) => n.toLocaleString('ko-KR')

function itemSummary(lines: { itemName: string }[]): string {
  if (lines.length === 0) return '-'
  return lines[0].itemName + (lines.length > 1 ? ` 외 ${lines.length - 1}건` : '')
}

export default function TradeHistoryPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 필터
  const [partnerId, setPartnerId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kindFilter, setKindFilter] = useState<'ALL' | Kind>('ALL')
  const [keyword, setKeyword] = useState('')
  /*
   * 2026-09-08 에 원본(E040716)을 열어 조건을 <b>전부</b> 쟀다 — <b>스물일곱</b>이다.
   * 사본에는 여덟뿐이었다(열두 번째 같은 구멍).
   */
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const [itemCodeCond, setItemCodeCond] = useState('')
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const mgmt = useItemMgmt()
  const pgroups = usePartnerGroups()

  async function load() {
    setLoading(true); setError('')
    try {
      const [p, s, b] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setPartners(p.data)
      const merged: Row[] = []
      for (const d of s.data) {
        merged.push({
          key: `S-${d.id}`, kind: 'SALE', date: d.saleDate, docNo: d.docNo,
          partnerId: d.partnerId, partnerName: d.partnerName, warehouseName: d.warehouseName,
          itemSummary: itemSummary(d.lines), qty: d.lines.reduce((a, l) => a + l.quantity, 0),
          supply: d.supplyAmount, vat: d.vatAmount, total: d.totalAmount, employeeName: d.employeeName,
          itemIds: d.lines.map((l) => l.itemId), itemCodes: d.lines.map((l) => l.itemCode),
          itemCategories: [...new Set(d.lines.map((l) => l.itemCategoryName).filter(Boolean) as string[])],
          projectName: d.projectName ?? null,
        })
      }
      for (const d of b.data) {
        merged.push({
          key: `P-${d.id}`, kind: 'PURCHASE', date: d.purchaseDate, docNo: d.docNo,
          partnerId: d.partnerId, partnerName: d.partnerName, warehouseName: d.warehouseName,
          itemSummary: itemSummary(d.lines), qty: d.lines.reduce((a, l) => a + l.quantity, 0),
          supply: d.supplyAmount, vat: d.vatAmount, total: d.totalAmount, employeeName: d.employeeName,
          itemIds: d.lines.map((l) => l.itemId), itemCodes: d.lines.map((l) => l.itemCode),
          itemCategories: [...new Set(d.lines.map((l) => l.itemCategoryName).filter(Boolean) as string[])],
          projectName: d.projectName ?? null,
        })
      }
      setRows(merged)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const pid = partnerId ? Number(partnerId) : null
    return rows
      .filter((r) => {
        if (pid != null && r.partnerId !== pid) return false
        if (from && r.date < from) return false
        if (to && r.date > to) return false
        if (kindFilter !== 'ALL' && r.kind !== kindFilter) return false
        if (kw && !r.partnerName.includes(kw) && !r.itemSummary.includes(kw) && !r.docNo.includes(kw)) return false
        if (partnerGroupCond && pgroups.groupOfName(r.partnerName) !== partnerGroupCond) return false
        if (itemCodeCond && !r.itemCodes.some((c) => c.includes(itemCodeCond))) return false
        if (categoryCond && !r.itemCategories.includes(categoryCond)) return false
        if (itemGroupCond && !mgmt.groupHits(r.itemIds, itemGroupCond)) return false
        if (whCond && !(r.warehouseName ?? '').includes(whCond)) return false
        if (projectCond && (r.projectName ?? '') !== projectCond) return false
        if (empCond && (r.employeeName ?? '') !== empCond) return false
        if (amountFrom && r.total < Number(amountFrom)) return false
        if (amountTo && r.total > Number(amountTo)) return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key < b.key ? 1 : -1))
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows, partnerId, from, to, kindFilter, keyword, partnerGroupCond, pgroups.groupOptions,
      itemCodeCond, categoryCond, itemGroupCond, mgmt.groupOptions, whCond, projectCond, empCond,
      amountFrom, amountTo])

  const totals = useMemo(() => shown.reduce((s, r) => {
    if (r.kind === 'SALE') { s.saleSupply += r.supply; s.saleTotal += r.total }
    else { s.buySupply += r.supply; s.buyTotal += r.total }
    return s
  }, { saleSupply: 0, saleTotal: 0, buySupply: 0, buyTotal: 0 }), [shown])

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }
  const saleCount = rows.filter((r) => r.kind === 'SALE').length
  const buyCount = rows.filter((r) => r.kind === 'PURCHASE').length


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    일자: (r) => r.date,
  })

  return (
    <EcListShell
      title="거래이력조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">거래처 중심으로 판매·구매 전표를 시간순 통합. 채권/채무 잔액은 거래처관리대장 참조.</p>

      {/* 원본 첫 조건이 <b>[구분]</b> 이다(2026-09-08 실측) — 조건 상자보다 앞에 둔다. */}
      {/*
        원본 거래이력조회 조건의 <b>[구분]</b>. 이 알약이 그 일을 하는데 <b>이름표가 없어</b>
        무엇을 고르는 줄인지 화면만 보고는 알 수 없었다.
      */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>구분</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'SALE', 'PURCHASE'] as const).map((k) => (
            <button key={k} onClick={() => setKindFilter(k)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: kindFilter === k ? 'var(--ec-blue)' : '#fff', color: kindFilter === k ? '#fff' : '#3a4453', fontWeight: kindFilter === k ? 700 : 400,
            }}>{k === 'ALL' ? '전체' : KIND_COLOR[k].label} ({k === 'ALL' ? rows.length : k === 'SALE' ? saleCount : buyCount})</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          판매 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.saleTotal)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          구매 <b style={{ color: '#a5561b', fontSize: 14 }}>{won(totals.buyTotal)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          순액 <b style={{ color: (totals.saleTotal - totals.buyTotal) >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{won(totals.saleTotal - totals.buyTotal)}</b>
        </div>
      </div>

      {/* 조회 조건 */}
      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* 원본 거래이력조회의 이름은 [기간]이 아니라 <b>[전표일자]</b> 다(사본 실측). */}
          <span style={label}>전표일자</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={230} value={partnerId} onChange={setPartnerId}
                           items={partnerCodeItems(partners)} />
        </div>
        {/*
          원본 차례(2026-09-08 실측, 스물일곱): 구분 · (작업일자 · 작업시간) · 전표일자 ·
          (메뉴) · 거래처 · <b>거래처그룹1</b> · (그룹2 · 계층) · <b>품목코드 · 품목구분 ·
          품목그룹1</b> · (그룹2·3 · 계층) · <b>창고</b> · (창고계층) · <b>프로젝트</b> ·
          (프로젝트그룹1·2) · <b>담당자 · 금액</b> · (작업자 · 행위 · 기타 · 양식) · 적용양식.
        */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>거래처그룹1</span>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroupCond} onChange={setPartnerGroupCond}
                           items={pgroups.groupOptions.map((n) => ({ value: n, name: n }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목코드</span>
          <input className="ec-input" value={itemCodeCond} onChange={(e) => setItemCodeCond(e.target.value)} style={{ width: 150 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목구분</span>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체"
                           value={categoryCond} onChange={setCategoryCond}
                           items={[...new Set(rows.flatMap((r) => r.itemCategories))].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목그룹1</span>
          <CodePickerField label="품목그룹1" hideLabel width={140} emptyLabel="전체"
                           value={itemGroupCond} onChange={setItemGroupCond}
                           items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={150} emptyLabel="전체"
                           value={whCond} onChange={setWhCond}
                           items={[...new Set(rows.map((r) => r.warehouseName).filter(Boolean))].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel width={150} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond}
                           items={[...new Set(rows.map((r) => r.projectName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>담당자</span>
          <CodePickerField label="담당자" hideLabel width={140} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={[...new Set(rows.map((r) => r.employeeName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>금액</span>
          <input type="number" className="ec-input text-right" placeholder="이상" value={amountFrom}
                 onChange={(e) => setAmountFrom(e.target.value)} style={{ width: 120 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="number" className="ec-input text-right" placeholder="이하" value={amountTo}
                 onChange={(e) => setAmountTo(e.target.value)} style={{ width: 120 }} />
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('일자')}>일자 {sort.mark('일자')}</th>
            <th style={{ textAlign: 'center', width: 54 }}>구분</th>
            <th>전표번호</th>
            <th>거래처</th>
            <th>품목</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
            <th style={{ textAlign: 'right' }}>합계</th>
            <th>창고</th>
            <th>담당자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '거래 내역이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : sort.sorted.map((r, i) => {
            const c = KIND_COLOR[r.kind]
            return (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(r.date)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: c.bg, color: c.fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{c.label}</span>
                </td>
                <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                <td>{r.partnerName}</td>
                <td>{r.itemSummary}</td>
                <td style={{ textAlign: 'right' }}>{won(r.qty)}</td>
                <td style={{ textAlign: 'right' }}>{won(r.supply)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.vat)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: c.fg }}>{won(r.total)}</td>
                <td style={{ color: '#5a626e' }}>{r.warehouseName}</td>
                <td style={{ color: '#5a626e' }}>{r.employeeName ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
