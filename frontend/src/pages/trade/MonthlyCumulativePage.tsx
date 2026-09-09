import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { periodOf, ymd } from '../../components/EcPeriodPicks'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/**
 * 영업관리 > 현황누계표 (이카운트 E040709)
 * 연도별 12개월의 당월/누계 매출·매입·이익(추정)을 시계열로 본다.
 * 데이터는 GET /api/sales + /purchases 집계(백엔드 무변경). 이익 = 매출−매입(추정, 원가매칭 아님).
 *
 * <p>2026-09-08 에 원본을 열어 조건 판을 재니 <b>열아홉</b>이다(사본에는 일곱뿐이었다).
 * 접힌 줄은 없고 [기본]·[전체] 두 탭이 같은 판을 쓴다. 차례:
 * <b>구분</b> · 창고 · (창고계층그룹) · 거래처 · <b>거래처그룹1</b> · (거래처그룹2 ·
 * 거래처계층그룹) · 품목 · <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) ·
 * 프로젝트 · (프로젝트그룹1/2) · 관리항목 · 내.외자구분 · <b>기타</b>.
 *
 * <p><b>[구분] 이 통째로 없었다.</b> 그 안에는 넷이 들어 있다 —
 * <b>표시방법</b>(종★ · 횡) · 기준일자(금월) · 비교기간(사용안함★) · 비교대상.
 * 우리는 해만 고르고 표를 <b>늘 세로로</b>(월이 행) 그렸다. 원본은 눕혀 볼 수 있다 —
 * 열두 달을 나란히 놓고 훑는 것이 이 표를 보는 흔한 방식이다.
 *
 * <p>[기타]도 없었다 — 체크는 <b>결재방표시</b> 하나이고 꺼짐이 기본이다.
 *
 * <p><b>2026-09-09 격자를 재니 우리 표와 아예 다른 표였다.</b> 원본 [종] 격자는
 * <b>현황 종류 × 누계</b> 다 —
 * 머리가 [(이름 없는 칸) · 구분 · 기간 · 수량 · 공급가액 · 부가세 · 합계(금액)] 이고,
 * 이름 없는 첫 칸이 <b>판매현황 · 구매현황 · 생산입고현황 · 창고이동현황</b> 넷을
 * 세 줄씩 묶어(rowSpan 3) 이름 붙인다. 그 세 줄이 [기간 누계]·[월 누계]·[년 누계] 이고
 * [기간] 칸에 그 범위가 적힌다(2026/09/01~2026/09/09 · 2026/09 · 2026/).
 *
 * <p>우리 표는 <b>열두 달 × 매출·매입·이익</b> 이다. 축이 달라 열 이름이 하나도 안 겹친다.
 * 원본 표를 만들려면 (1) 기간 조건(기준일자)이 있어야 [기간 누계]가 서고,
 * (2) 생산입고·창고이동 자료를 이 화면이 받아야 넷이 다 찬다 — 지금은 판매·구매만 받는다.
 * 못 만드는 것이 아니라 <b>아직 안 만든 것</b>이라 pending-columns.json 에 적었다.
 * 우리 열두 달 표는 <b>원본에 없는 우리 표</b>다 — 지우지 않고 그대로 둔다.
 */

interface MonthRow {
  month: number
  sale: number; saleCum: number
  buy: number; buyCum: number
  profit: number; profitCum: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))

export default function MonthlyCumulativePage() {
  const [year, setYear] = useState<number>(thisYear())
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 현황누계표의 조건 차례는 <b>창고 · 거래처 · 품목 · 프로젝트</b> 다(사본 실측).
   * 해가 전부였다 — 판매·구매 응답이 셋을 다 보내고 있는데 걸 자리가 없었다.
   */
  /*
   * 원본 [구분]의 <b>표시방법</b> — 종(월이 행) · 횡(월이 열). 기본은 <b>종</b>이다.
   * 우리는 종 하나로 박혀 있었다.
   */
  const [layout, setLayout] = useState<'종' | '횡'>('종')
  /**
   * 원본 [구분] 안의 <b>기준일자</b>(기본 금월). [기간 누계]가 이 범위를 센다 —
   * 이 칸이 없어서 원본 격자의 첫 줄을 아예 만들 수가 없었다.
   */
  const initP = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  /* 원본 [기타] — 결재방표시 하나, 기본 꺼짐. */
  const [signBox, setSignBox] = useState(false)
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const [project, setProject] = useState('')
  const [item, setItem] = useState('')
  /* 2026-09-08 실측으로 만든 셋. 값은 마스터와 라인에 이미 있다. */
  const [partnerGroup, setPartnerGroup] = useState('')
  const [category, setCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const pgroup = usePartnerGroups()
  const pickers = useCondPickers(['warehouses', 'partners', 'projects', 'items'])

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b] = await Promise.all([api.get<SalesDoc[]>('/sales'), api.get<PurchaseDoc[]>('/purchases')])
      setSales(s.data); setPurchases(b.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  /**
   * 원본 [관리항목]. 품목 마스터에 붙는 값이라 전표 응답에는 없다 —
   * 품목 마스터를 받아 줄로 잇는다(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')

  /* 품목은 전표가 아니라 <b>라인</b>에 있다 — 그 품목이 든 전표만 센다. */
  /*
   * 원본 [품목구분]·[품목그룹1]도 라인에 붙는 값이라, 전표를 셀 때는
   * <b>그 조건에 맞는 줄을 하나라도 가진 전표</b>만 센다(판매구매집계표와 같은 규칙).
   * <b>누계 표와 달별 표가 같은 규칙을 쓴다</b> — 한쪽만 고치면 두 표의 숫자가 갈린다.
   */
  const lineHit = (l: { itemId: number; itemCategoryName: string | null }) =>
    (!category || (l.itemCategoryName ?? '') === category)
    && (!itemGroup || mgmt.groupOf(l.itemId) === itemGroup)
  const keepDoc = (d: { warehouseName: string; partnerName: string; projectName: string | null;
                        lines: { itemName: string; itemId: number; itemCategoryName: string | null }[] }) =>
    (!warehouse || d.warehouseName.includes(warehouse))
    && (!partner || d.partnerName.includes(partner))
    && (!partnerGroup || pgroup.groupOfName(d.partnerName) === partnerGroup)
    && (!project || (d.projectName ?? '').includes(project))
    && (!item || d.lines.some((l) => l.itemName.includes(item)))
    && d.lines.some(lineHit)
    && mgmt.hits(d.lines.map((l) => l.itemId), mgmtCond)

  /**
   * <b>원본 [종] 격자</b> — [(현황 이름) · 구분 · 기간 · 수량 · 공급가액 · 부가세 · 합계(금액)].
   * 현황 하나가 세 줄([기간 누계]·[월 누계]·[년 누계])을 rowSpan 으로 묶는다.
   *
   * <p>지금 채우는 것은 <b>판매현황 · 구매현황</b> 둘이다. 원본은 여기에
   * <b>생산입고현황 · 창고이동현황</b> 두 덩어리가 더 붙는데, 이 화면이 그 자료를
   * 안 받는다(판매·구매만 받는다) — 지어내지 않고 <b>줄을 안 그린다.</b>
   * 그 둘을 받아 오면 같은 함수에 덩어리만 더하면 된다.
   */
  const cumRows = useMemo(() => {
    const monthFrom = to.slice(0, 8) + '01'
    const yearFrom = to.slice(0, 4) + '-01-01'
    const spans: { name: string; from: string; to: string }[] = [
      { name: '기간 누계', from, to },
      { name: '월 누계', from: monthFrom, to },
      { name: '년 누계', from: yearFrom, to },
    ]
    const dash = (a: string, b: string) => `${a.replace(/-/g, '/')}~${b.replace(/-/g, '/')}`
    const sum = (docs: { date: string; supply: number; vat: number; qty: number }[], a: string, b: string) => {
      let qty = 0, supply = 0, vat = 0
      for (const d of docs) {
        if (d.date < a || d.date > b) continue
        qty += d.qty; supply += d.supply; vat += d.vat
      }
      return { qty, supply, vat }
    }
    return [
      ['판매현황', sales.filter(keepDoc).map((d) => ({
        date: d.saleDate, supply: d.supplyAmount, vat: d.vatAmount,
        qty: d.lines.reduce((n, l) => n + l.quantity, 0),
      }))],
      ['구매현황', purchases.filter(keepDoc).map((d) => ({
        date: d.purchaseDate, supply: d.supplyAmount, vat: d.vatAmount,
        qty: d.lines.reduce((n, l) => n + l.quantity, 0),
      }))],
    ].map(([name, docs]) => ({
      name: name as string,
      lines: spans.map((sp) => ({
        gubun: sp.name,
        period: dash(sp.from, sp.to),
        ...sum(docs as { date: string; supply: number; vat: number; qty: number }[], sp.from, sp.to),
      })),
    }))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [sales, purchases, from, to, warehouse, partner, project, item, partnerGroup, category, itemGroup, mgmtCond])

  const rows = useMemo<MonthRow[]>(() => {
    const saleByM = new Array(13).fill(0)
    const buyByM = new Array(13).fill(0)
    for (const d of sales) {
      if (d.saleDate.slice(0, 4) !== String(year)) continue
      if (!keepDoc(d)) continue
      saleByM[Number(d.saleDate.slice(5, 7))] += d.supplyAmount
    }
    for (const d of purchases) {
      if (d.purchaseDate.slice(0, 4) !== String(year)) continue
      if (!keepDoc(d)) continue
      buyByM[Number(d.purchaseDate.slice(5, 7))] += d.supplyAmount
    }
    const out: MonthRow[] = []
    let saleCum = 0, buyCum = 0, profitCum = 0
    for (let m = 1; m <= 12; m++) {
      const sale = saleByM[m], buy = buyByM[m], profit = sale - buy
      saleCum += sale; buyCum += buy; profitCum += profit
      out.push({ month: m, sale, saleCum, buy, buyCum, profit, profitCum })
    }
    return out
  }, [sales, purchases, year, warehouse, partner, project, item, partnerGroup, category, itemGroup, mgmtCond])

  /*
   * [표시방법]이 <b>횡</b>이면 열이 열두 달 + 연간으로 바뀐다 — 정적으로는 못 세는 표라
   * 렌더된 표를 직접 재는 검사를 단다.
   */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '현황누계표', [layout])

  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]
  const yTotal = rows.length ? rows[rows.length - 1] : null

  return (
    <EcListShell
      title="현황누계표"
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
      signLine={signBox}
    >
      <p className="mb-2 text-xs text-slate-500">월별 당월·누계 매출·매입·이익(추정). 이익 = 매출공급가 − 매입공급가(원가매칭 아님).</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {/*
          원본 [구분] 안의 <b>표시방법</b> — 종(월이 행) · 횡(월이 열). 기본은 종이다.
          [구분]에는 기준일자·비교기간·비교대상도 함께 들어 있는데, 우리 표는
          <b>한 해 열두 달</b>이 축이라 기간을 연 단위로만 고른다(아래 [연도]).
        */}
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>구분</span>
        <div className="ec-pills">
          {(['종', '횡'] as const).map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${layout === v ? ' active' : ''}`}
                    onClick={() => setLayout(v)}>{v}</button>
          ))}
        </div>
        {/*
          원본 [구분] 안의 <b>기준일자</b>(기본 금월). 원본 격자의 [기간 누계]가 이 범위를 센다 —
          이 칸이 없어서 그 줄을 아예 만들 수가 없었다. [연도]는 아래 달별 표(우리 표)가 쓴다.
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>기준일자</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input className="ec-input" type="date" style={{ width: 140 }} value={from}
                 onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="date" style={{ width: 140 }} value={to}
                 onChange={(e) => setTo(e.target.value)} />
        </span>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>연도</span>
        <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        {/* 원본 조건 차례: 창고 · 거래처 · 품목 · 프로젝트 */}
        <CodePickerField label="창고" width={150} emptyLabel="전체"
                         value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        <CodePickerField label="거래처" width={150} emptyLabel="전체"
                         value={partner} onChange={setPartner} items={pickers.partners} />
        <CodePickerField label="거래처그룹1" width={140} emptyLabel="전체"
                         value={partnerGroup} onChange={setPartnerGroup}
                         items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        {/* 원본 차례는 창고 · 거래처 · <b>품목</b> · 프로젝트 — 품목이 프로젝트보다 앞이다.
            주석에는 넷을 다 적어 놓고 셋만 만들어 두었다. */}
        <CodePickerField label="품목" width={150} emptyLabel="전체"
                         value={item} onChange={setItem} items={pickers.items} />
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>품목구분</span>
        <select className="ec-input" value={category} style={{ width: 130 }}
                onChange={(e) => setCategory(e.target.value)}>
          <option value="">전체</option>
          {[...new Set([...sales, ...purchases].flatMap((d) => d.lines.map((l) => l.itemCategoryName))
            .filter(Boolean) as string[])].sort().map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>품목그룹1</span>
        <select className="ec-input" value={itemGroup} style={{ width: 150 }}
                onChange={(e) => setItemGroup(e.target.value)}>
          <option value="">전체</option>
          {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {/* 원본 차례: [품목] · [프로젝트] · <b>[관리항목]</b> (사본 실측 — 이 화면에서는 맨 뒤다). */}
        <CodePickerField label="프로젝트" width={150} emptyLabel="전체"
                         value={project} onChange={setProject} items={pickers.projects} />
        <CodePickerField label="관리항목" width={150} emptyLabel="전체"
                         value={mgmtCond} onChange={setMgmtCond}
                         items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>기타</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
          <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />결재방표시
        </label>
        {yTotal && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
            연매출 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(yTotal.saleCum)}</b>
            <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
            연이익 <b style={{ color: yTotal.profitCum >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{won(yTotal.profitCum)}</b>
          </span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        원본 [구분]의 <b>표시방법</b>이 <b>횡</b>이면 열두 달을 <b>열</b>로 눕힌다.
        같은 숫자를 돌려 놓는 것뿐이지만, 달을 나란히 놓고 훑는 것이 이 표를 보는
        흔한 방식이라 원본이 첫 조건으로 둔다.
      */}
      {/*
        <b>원본 [종] 격자</b>(2026-09-09 실측) — [(현황 이름) · 구분 · 기간 · 수량 ·
        공급가액 · 부가세 · 합계(금액)]. 현황 하나가 세 줄을 rowSpan 으로 묶는다.
        지금 채우는 것은 <b>판매현황 · 구매현황</b> 둘이고, 원본에 더 있는
        <b>생산입고현황 · 창고이동현황</b>은 이 화면이 그 자료를 안 받아 <b>줄을 안 그린다</b>
        (지어내지 않는다 — 받아 오면 덩어리만 더하면 된다).
      */}
      <table className="w-full text-left" style={{ marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={{ width: 110 }}></th>
            <th style={{ width: 90 }}>구분</th>
            <th style={{ width: 190 }}>기간</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
            <th style={{ textAlign: 'right' }}>합계(금액)</th>
          </tr>
        </thead>
        <tbody>
          {cumRows.map((g) => g.lines.map((l, i) => (
            <tr key={g.name + l.gubun}>
              {i === 0 && (
                <td rowSpan={3} style={{ fontWeight: 700, background: '#f7f9fb', verticalAlign: 'middle' }}>{g.name}</td>
              )}
              <td>{l.gubun}</td>
              <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{l.period}</td>
              <td style={{ textAlign: 'right' }}>{l.qty ? won(l.qty) : ''}</td>
              <td style={{ textAlign: 'right' }}>{l.supply ? won(l.supply) : ''}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{l.vat ? won(l.vat) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue)' }}>
                {won(l.supply + l.vat)}
              </td>
            </tr>
          )))}
        </tbody>
      </table>

      {layout === '횡' ? (
      <div ref={tableRef} style={{ overflowX: 'auto' }}>
        <table className="w-full text-left" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: '#f5f7fa', minWidth: 110 }}>구분</th>
              {rows.map((r) => <th key={r.month} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.month}월</th>)}
              <th style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>연간</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['당월매출', (r: MonthRow) => r.sale, yTotal ? yTotal.saleCum : 0],
              ['누계매출', (r: MonthRow) => r.saleCum, yTotal ? yTotal.saleCum : 0],
              ['당월매입', (r: MonthRow) => r.buy, yTotal ? yTotal.buyCum : 0],
              ['누계매입', (r: MonthRow) => r.buyCum, yTotal ? yTotal.buyCum : 0],
              ['당월이익', (r: MonthRow) => r.profit, yTotal ? yTotal.profitCum : 0],
              ['누계이익', (r: MonthRow) => r.profitCum, yTotal ? yTotal.profitCum : 0],
            ] as [string, (r: MonthRow) => number, number][]).map(([name, of, total]) => (
              <tr key={name}>
                <td style={{ position: 'sticky', left: 0, background: '#fff', fontWeight: 600 }}>{name}</td>
                {rows.map((r) => (
                  <td key={r.month} style={{ textAlign: 'right', color: of(r) ? undefined : '#c5cbd3' }}>
                    {of(r) ? won(of(r)) : ''}
                  </td>
                ))}
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue)' }}>{won(total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 60 }}>월</th>
            <th style={{ textAlign: 'right' }}>당월매출</th>
            <th style={{ textAlign: 'right' }}>누계매출</th>
            <th style={{ textAlign: 'right' }}>당월매입</th>
            <th style={{ textAlign: 'right' }}>누계매입</th>
            <th style={{ textAlign: 'right' }}>당월이익</th>
            <th style={{ textAlign: 'right' }}>누계이익</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.map((r) => (
            <tr key={r.month}>
              <td style={{ fontWeight: 600 }}>{r.month}월</td>
              <td style={{ textAlign: 'right', color: r.sale ? undefined : '#c5cbd3' }}>{r.sale ? won(r.sale) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.saleCum)}</td>
              <td style={{ textAlign: 'right', color: r.buy ? undefined : '#c5cbd3' }}>{r.buy ? won(r.buy) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{won(r.buyCum)}</td>
              <td style={{ textAlign: 'right', color: r.profit === 0 ? '#c5cbd3' : r.profit > 0 ? '#1c7c3c' : '#c60a2e' }}>{r.profit ? won(r.profit) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.profitCum >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(r.profitCum)}</td>
            </tr>
          ))}
        </tbody>
        {yTotal && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td>연간</td>
              <td style={{ textAlign: 'right' }}>{won(yTotal.saleCum)}</td>
              <td></td>
              <td style={{ textAlign: 'right' }}>{won(yTotal.buyCum)}</td>
              <td></td>
              <td style={{ textAlign: 'right', color: yTotal.profitCum >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(yTotal.profitCum)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
      )}
    </EcListShell>
  )
}
