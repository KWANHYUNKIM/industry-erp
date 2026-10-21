import { useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc, PurchaseDoc, Quotation, StockTransfer, Production } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { periodOf } from '../../components/EcPeriodPicks'
import { dateNo } from '../../utils/dateNo'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { useRequired } from '../../utils/useRequired'

/**
 * 재고 > 출력물 > 일보 (이카운트 E040708) — 2026-10-22 원본 실측.
 *
 * 원본 일보는 <b>[종류]를 골라야</b> 그려진다(필수 — 비워 두고 [검색(F8)] 하면 칸이 빨개지고 격자가 안 나온다.
 * 전엔 이 칸을 몰라 "격자가 안 그려진다"고만 적었다). 고른 종류마다 '1. 판매현황' 처럼 번호 붙은 표가
 * 세로로 이어지고, 표마다 열이 다르다:
 * <ul>
 *   <li>견적서 · 구매: 일자-No. · 거래처명 · 적요 · 품목명[규격] · 수량 · 단가 · 금액 (최근 일자 먼저)</li>
 *   <li>판매: 일자 · 품명 및 규격 · 수량 · 단가 · 공급가액 · 부가세 · 합 계 · 판매처이름, 'N 계'(월) · 합계 줄 — 계 줄의 단가 칸은 단가를 그대로 더한다</li>
 *   <li>수금 · 지급: 일자-No. · 거래처명 · 금액 · 적요 + 합계</li>
 *   <li>생산입고: 일자-No. · 출고창고명 · 입고창고명 · 품목명[규격명] · 수량(소수 둘째) · 생산금액 · 적요</li>
 *   <li>창고이동: 일자-No. · 출고창고명 · 입고창고명 · 품목명[규격] · 수량 · 금액(수량*입고단가) · 적요 + 날마다 'YYYY/MM/DD 계'</li>
 * </ul>
 * 기준일자 기본은 금월(~오늘). 종류 목록은 원본 그대로이나 우리 자료가 있는 것만 둔다(주문서 · 출하 · 발주 · 작업지시 · 재고조정 등은 아직 없다).
 * 부서 · 내.외자구분 · 결재방표시는 이 화면이 합치는 전표에 대응 필드가 없어 뺀다.
 */
const num = (n: number) => Number(n).toLocaleString('ko-KR')
const qty2 = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortNo = (date: string, no: string) => { const seq = no.split('-').pop() ?? ''; return `${date.slice(5).replace('-', '/')}-${Number(seq) || seq}` }
const itemLabel = (name: string, spec: string | null | undefined) => (spec ? `${name} [${spec}]` : name)

/** 원본 [종류] 창 '검색' 열 차례(재고 I). 우리 자료가 있는 것만. */
const KINDS = ['견적서', '판매', '수금', '구매', '지급', '생산입고', '창고이동'] as const
type Kind = typeof KINDS[number]
const KIND_GROUP: Record<Kind, string> = { 견적서: '영업관리', 판매: '영업관리', 수금: '영업관리', 구매: '구매관리', 지급: '구매관리', 생산입고: '생산/외주', 창고이동: '기타이동' }

interface SettleRow { id: number; docNo: string; type: 'RECEIPT' | 'PAYMENT'; partnerId: number; partnerName: string; settleDate: string; amount: number; projectId: number | null; note: string | null }
interface Data {
  quotes: Quotation[]; sales: SalesDoc[]; settles: SettleRow[]; purchases: PurchaseDoc[]; productions: Production[]; transfers: StockTransfer[]
}

export default function DailyReportPage() {
  const init = periodOf('금월(~오늘)') ?? { from: '', to: '' }
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [kinds, setKinds] = useState<string[]>([])
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [project, setProject] = useState('')
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const req = useRequired()
  const [data, setData] = useState<Data | null>(null)
  const [shown, setShown] = useState<{ kinds: Kind[]; from: string; to: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    /* 원본: [종류] 필수 — 비면 칸이 빨개지고 조회하지 않는다. */
    if (!req.check({ kinds: kinds.length > 0 })) return
    const picked = KINDS.filter((k) => kinds.includes(k))
    setLoading(true); setError('')
    try {
      const params = { from, to }
      const get = <T,>(on: boolean, url: string, p: Record<string, unknown> = params) =>
        on ? api.get<T[]>(url, { params: p }).then((r) => r.data) : Promise.resolve([] as T[])
      const [quotes, sales, settles, purchases, productions, transfers] = await Promise.all([
        get<Quotation>(picked.includes('견적서'), '/quotations'),
        get<SalesDoc>(picked.includes('판매'), '/sales'),
        get<SettleRow>(picked.includes('수금') || picked.includes('지급'), '/settlements'),
        get<PurchaseDoc>(picked.includes('구매'), '/purchases'),
        get<Production>(picked.includes('생산입고'), '/productions'),
        get<StockTransfer>(picked.includes('창고이동'), '/stock-transfers'),
      ])
      setData({ quotes, sales, settles, purchases, productions, transfers })
      setShown({ kinds: picked, from, to })
    } catch (err) { setError(extractErrorMessage(err)); setData(null); setShown(null) }
    finally { setLoading(false) }
  }

  const reset = () => {
    const p = periodOf('금월(~오늘)') ?? { from: '', to: '' }
    setFrom(p.from); setTo(p.to); setKinds([]); setWarehouse(''); setPartner(''); setItem(''); setProject(''); setMgmtCond('')
    setData(null); setShown(null); req.reset()
  }

  const inP = (d: string) => (!shown || ((!shown.from || d >= shown.from) && (!shown.to || d <= shown.to)))
  /** 조건(창고 · 거래처 · 품목 · 프로젝트 · 관리항목) — 종류마다 그 전표에 있는 것만 건다. */
  const ok = (o: { partnerId?: number | null; warehouseIds?: (number | null | undefined)[]; projectId?: number | null; itemIds?: number[] }) =>
    (!partner || String(o.partnerId) === partner)
    && (!warehouse || (o.warehouseIds ?? []).some((w) => String(w) === warehouse))
    && (!project || String(o.projectId) === project)
    && (!item || (o.itemIds ?? []).some((i) => String(i) === item))
    && mgmt.hits(o.itemIds ?? [], mgmtCond)

  const sections = useMemo(() => {
    if (!data || !shown) return []
    const d = data
    const byDesc = <T,>(date: (x: T) => string, no: (x: T) => string) => (a: T, b: T) =>
      date(a) !== date(b) ? (date(a) < date(b) ? 1 : -1) : (Number(no(b).split('-').pop()) || 0) - (Number(no(a).split('-').pop()) || 0)
    const byAsc = <T,>(date: (x: T) => string, no: (x: T) => string) => (a: T, b: T) =>
      date(a) !== date(b) ? (date(a) < date(b) ? -1 : 1) : (Number(no(a).split('-').pop()) || 0) - (Number(no(b).split('-').pop()) || 0)
    return shown.kinds.map((k) => {
      if (k === '견적서') {
        const rows = d.quotes.filter((q) => inP(q.quoteDate) && ok({ partnerId: q.partnerId, warehouseIds: [q.warehouseId], projectId: q.projectId, itemIds: q.lines.map((l) => l.itemId) }))
          .sort(byDesc((q) => q.quoteDate, (q) => q.quoteNo))
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '적요', '품목명[규격]', '수량', '단가', '금액']} right={[4, 5, 6]}
          rows={rows.flatMap((q) => q.lines.map((l) => [dateNo(q.quoteDate, q.quoteNo), q.partnerName, q.remark ?? '', itemLabel(l.itemName, l.spec), num(l.quantity), num(l.unitPrice), num(l.supplyAmount)]))} /> }
      }
      if (k === '판매') {
        const docs = d.sales.filter((s) => inP(s.saleDate) && ok({ partnerId: s.partnerId, warehouseIds: [s.warehouseId], projectId: s.projectId, itemIds: s.lines.map((l) => l.itemId) }))
          .sort(byAsc((s) => s.saleDate, (s) => s.docNo))
        const months = [...new Set(docs.map((s) => s.saleDate.slice(0, 7)))]
        const sum = (rows: SalesDoc[]) => rows.flatMap((s) => s.lines).reduce((a, l) => ({
          q: a.q + Number(l.quantity), u: a.u + Number(l.unitPrice), s: a.s + Number(l.supplyAmount), v: a.v + Number(l.vatAmount) }), { q: 0, u: 0, s: 0, v: 0 })
        const fmt = (a: { q: number; u: number; s: number; v: number }) => [num(a.q), num(a.u), num(a.s), num(a.v), num(a.s + a.v), '']
        const body: { cells: string[]; bold?: boolean }[] = []
        months.forEach((m) => {
          const ms = docs.filter((s) => s.saleDate.startsWith(m))
          ms.forEach((s) => s.lines.forEach((l) => body.push({ cells: [shortNo(s.saleDate, s.docNo), itemLabel(l.itemName, l.spec), num(l.quantity), num(l.unitPrice), num(l.supplyAmount), num(l.vatAmount), num(Number(l.supplyAmount) + Number(l.vatAmount)), s.partnerName] })))
          body.push({ cells: [`${Number(m.slice(5))} 계`, '', ...fmt(sum(ms))], bold: true })
        })
        if (docs.length) body.push({ cells: ['합계', '', ...fmt(sum(docs))], bold: true })
        return { kind: k, node: <LineTable head={['일자', '품명 및 규격', '수량', '단가', '공급가액', '부가세', '합 계', '판매처이름']} right={[2, 3, 4, 5, 6]} rows={body} /> }
      }
      if (k === '수금' || k === '지급') {
        const type = k === '수금' ? 'RECEIPT' : 'PAYMENT'
        const rows = d.settles.filter((s) => s.type === type && inP(s.settleDate) && ok({ partnerId: s.partnerId, projectId: s.projectId }))
          .sort(byAsc((s) => s.settleDate, (s) => s.docNo))
        const body = rows.map((s) => ({ cells: [dateNo(s.settleDate, s.docNo), s.partnerName, num(s.amount), s.note ?? ''] as string[] }))
        if (rows.length) body.push({ cells: ['합계', '', num(rows.reduce((a, s) => a + Number(s.amount), 0)), ''] })
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '금액', '적요']} right={[2]} rows={body} /> }
      }
      if (k === '구매') {
        const rows = d.purchases.filter((p) => inP(p.purchaseDate) && ok({ partnerId: p.partnerId, warehouseIds: [p.warehouseId], projectId: p.projectId, itemIds: p.lines.map((l) => l.itemId) }))
          .sort(byDesc((p) => p.purchaseDate, (p) => p.docNo))
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '적요', '품목명[규격]', '수량', '단가', '금액']} right={[4, 5, 6]}
          rows={rows.flatMap((p) => p.lines.map((l) => [dateNo(p.purchaseDate, p.docNo), p.partnerName, p.remark ?? '', itemLabel(l.itemName, l.spec), num(l.quantity), num(l.unitPrice), num(l.supplyAmount)]))} /> }
      }
      if (k === '생산입고') {
        const rows = d.productions.filter((p) => inP(p.productionDate) && ok({ warehouseIds: [p.warehouseId, p.fromWarehouseId], projectId: p.projectId, itemIds: [p.productId] }))
          .sort(byAsc((p) => p.productionDate, (p) => p.prodNo))
        return { kind: k, node: <LineTable head={['일자-No.', '출고창고명', '입고창고명', '품목명[규격명]', '수량', '생산금액', '적요']} right={[4, 5]}
          rows={rows.map((p) => [dateNo(p.productionDate, p.prodNo), p.fromWarehouseName ?? '', p.warehouseName, p.productName, qty2(p.producedQty), '', p.note ?? ''])} /> }
      }
      // 창고이동 — 날마다 'YYYY/MM/DD 계'
      const rows = d.transfers.filter((t) => inP(t.transferDate) && ok({ warehouseIds: [t.fromWarehouseId, t.toWarehouseId], projectId: t.projectId, itemIds: [t.itemId] }))
        .sort(byAsc((t) => t.transferDate, (t) => t.transferNo))
      const body: { cells: string[]; bold?: boolean }[] = []
      const days = [...new Set(rows.map((t) => t.transferDate))]
      days.forEach((day) => {
        const ds = rows.filter((t) => t.transferDate === day)
        ds.forEach((t) => body.push({ cells: [dateNo(t.transferDate, t.transferNo), t.fromWarehouseName, t.toWarehouseName, t.itemName, num(t.quantity), '', t.reason ?? ''] }))
        body.push({ cells: [`${day.replace(/-/g, '/')} 계`, '', '', '', num(ds.reduce((a, t) => a + Number(t.quantity), 0)), '', ''], bold: true })
      })
      return { kind: k, node: <LineTable head={['일자-No.', '출고창고명', '입고창고명', '품목명[규격]', '수량', '금액(수량*입고단가)', '적요']} right={[4, 5]} rows={body} /> }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shown, partner, warehouse, item, project, mgmtCond])

  return (
    <EcListShell
      title="일보"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="종류" pick>
          <CodePickerField label="종류" hideLabel width={300} multiple popupTitle="종류"
                           values={kinds} onChangeMulti={setKinds}
                           invalid={req.on('kinds', kinds.length > 0)}
                           items={KINDS.map((k) => ({ value: k, name: k, sub: KIND_GROUP[k] }))} />
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {loading && <p className="ec-empty">불러오는 중…</p>}

      {!loading && shown && data && (
        <>
          <EcReportHead title="일보" period={reportPeriod(shown.from, shown.to)} />
          {sections.map((s, i) => (
            <div key={s.kind} className="mb-[14px]">
              <div className="font-bold mb-[4px]">{i + 1}. {s.kind}현황</div>
              {s.node}
            </div>
          ))}
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}

/** 종류마다 열만 다른 표 — 줄이 없으면 원본 문구. 줄은 글자 배열 또는 { cells, bold }(계 · 합계 줄). */
function LineTable({ head, right, rows }: { head: string[]; right: number[]; rows: (string[] | { cells: string[]; bold?: boolean })[] }) {
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, '일보', [head.join(), rows.length])
  return (
    <table ref={ref} className="w-full text-left">
      <thead><tr>{head.map((h, i) => <th key={h} className={right.includes(i) ? 'text-right' : undefined}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={head.length} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((r, i) => {
          const cells = Array.isArray(r) ? r : r.cells
          const bold = !Array.isArray(r) && r.bold
          return (
            <tr key={i} className={bold ? 'font-bold' : undefined}>
              {cells.map((c, j) => <td key={j} className={right.includes(j) ? 'text-right' : undefined}>{c}</td>)}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

