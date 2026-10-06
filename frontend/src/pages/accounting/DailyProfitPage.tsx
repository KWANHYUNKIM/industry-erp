import { useRef, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc, Warehouse } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { costOf, sumExtraCost, type CostBasis } from '../../utils/costBasis'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemFlags } from '../../utils/useInactiveItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { useItemMgmt } from '../../utils/itemMgmtItems'

/**
 * 이익관리 > 일별이익현황 (이카운트 C000140)
 *
 * <b>이 화면의 이익 계산이 틀려 있었다.</b> `/api/profit/daily` 는 <b>그날의 매입액</b>을 원가로
 * 놓는다. 그러면 자재를 왕창 사들인 날은 이익이 크게 마이너스로 찍힌다 — 그날 잘 팔았어도.
 * 이익은 <b>판 물건의 원가</b>로 재야 한다. 원본이 하는 것도 그것이고, [원가] 조건이 있는 이유다.
 *
 * 그래서 판매 라인에서 직접 계산한다: 이익 = 판매액 − (판매수량 × 원가단가).
 * 매출과 매입을 나란히 보는 것 자체는 뜻이 있지만 그건 일보·판매구매집계표가 하는 일이고,
 * 그 값에 '이익'이라는 이름을 붙이면 안 된다.
 *
 * 원본 조건: 구분(라인별·품목별·거래처별·품목별거래처별·거래처별품목별·사용자지정집계) ·
 * 기준일자 · 창고 · 프로젝트 · 거래처 · 품목 · 판매액(공급가액 / 공급가액+VAT) ·
 * 원가(선입선출(판매) / 월별원가 / 입고단가(품목) / 입고단가(품목)-VAT제외) ·
 * 기타(결재방표시 / 수량관리제외품목포함) · 거래구분(전체 / 반품만 / 반품제외).
 *
 * 우리에게 없는 것과 이유:
 *   선입선출 — 입고 레이어를 남기지 않아 계산할 수 없다(일별재고현황과 같다)
 *   사용자지정집계 — 집계축을 사용자가 정의하는 기능이 없다
 *   결재방표시·수량관리제외품목 — 대응 개념이 없다
 * 대신 원본에 없는 <b>일자별</b>을 구분에 넣었다 — 화면 이름이 '일별'이라 하루 단위 줄이 있어야 한다.
 *
 * <p><b>원본 결과 열 실측(사본)</b>: 품목코드 · 품목명[규격] · 판매(수량·단가·금액) ·
 * 원가 · 이익 · 이익율 · <b>이익금액(부대비용포함)</b> · <b>판매부대비용</b>.
 * 뒤 두 열이 우리에게 없었다. 부대비용은 전표 합계에 더하지 않는다 — 거래처에 청구한
 * 돈이 아니라 우리가 쓴 돈이다. 그래서 판매액에는 안 들어가는데 <b>이익에서도 안 빠지고</b>
 * 있었다. 운반비를 쓸수록 이익이 좋아 보인다는 뜻이다.
 */
/**
 * [구분]. 원본 일별이익현황 사본 실측:
 *   라인별 | 품목별 | 거래처별 | 품목별거래처별 | 거래처별품목별 | 사용자지정집계
 * 우리에겐 거래처별품목별이 없었다 — 품목별거래처별과 <b>묶는 순서가 반대</b>다.
 * 같은 거래처의 품목을 나란히 보려면 이쪽이라야 한다.
 *
 * <p>'일자별' 은 원본에 없는 우리 것이다. 일별이익현황이니 하루 단위로 접어 보는 쪽이
 * 쓸모가 있어 맨 뒤에 남겼다. '사용자지정집계'(저장해 둔 집계 조합)는 아직 없다.
 */
type Mode = '라인별' | '품목별' | '거래처별' | '품목별거래처별' | '거래처별품목별' | '일자별'
const MODES = ['라인별', '품목별', '거래처별', '품목별거래처별', '거래처별품목별', '일자별'] as const
/**
 * 원가 기준.
 *
 * <p>원본 실측: [원가] 선입선출(판매) | 월별원가 | <b>입고단가(품목)</b> | 입고단가(품목) - VAT 제외
 *
 * <p>우리 '품목단가' 가 원본의 '입고단가(품목)' 에 해당하는데, 품목 단가가 하나뿐이던 시절
 * <b>판매단가</b>를 읽고 있었다. 원가에 판매가를 넣으면 이익이 0 근처로 나오는데
 * 숫자가 그럴듯해서 눈으로는 안 걸린다. 이제 품목의 구매단가를 읽는다.
 * 구매단가를 안 정한 품목(0)은 기준이 없는 것이므로 원가·이익을 '—' 로 둔다.
 *
 * <p>[선입선출(판매)] 는 서버(/stock/fifo-sale-costs)가 재고 이력을 일어난 차례로 걸어 판매 출고가 꺼낸 입고 층의 단가로 셈한다.
 */
type Basis = CostBasis

interface CostRow { itemId: number; period: string; standardTotal: number }

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const num = (n: number) => n.toLocaleString()
/* 원본 [이익율] 은 정수 % 다(2026-10-04 실측: 77%, 합계 41%). */
const rate = (profit: number, revenue: number) => (revenue === 0 ? 0 : Math.round((profit / revenue) * 100))

export default function DailyProfitPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['projects', 'partners', 'items'])
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다 —
   * 결재를 안 받을 자료까지 도장칸을 달고 나가면 종이가 한 칸씩 밀린다.
   */
  /*
   * 원본 [기타]의 <b>[수량관리제외품목포함]</b> — 재고수량을 안 세는 품목(용역·수수료 …)까지
   * 같이 볼지다. 기본은 <b>꺼짐</b>이다(사본 실측). 월별이익현황만 켜져 있고 나머지는 꺼져 있다.
   */
  const [withUntracked, setWithUntracked] = useState(false)
  const { untracked } = useItemFlags()
  const [signBox, setSignBox] = useState(false)
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [lastPrices, setLastPrices] = useState<{ itemId: number; unitPrice: number }[]>([])
  /* 원가 [선입선출(판매)] — 판매 전표 · 품목별 선입선출 단가(서버가 재고 이력으로 셈한다). 키는 '전표번호#품목id'. */
  const [fifo, setFifo] = useState<Map<string, number>>(new Map())
  /** 품목별 <b>구매단가</b>. 원가 기준 '입고단가(품목)' 이 쓴다. 0 이면 기준 없음. */
  const [unitPrices, setUnitPrices] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [whyOpen, setWhyOpen] = useState(false)

  /*
   * 화면을 열었을 때 켜져 있는 [구분]. 원본은 <b>[품목별]</b> 이다
   * (2026-09-01 원본 C000036 직접 실측 — 라디오가 품목별에 찍혀 있다).
   *
   * <p>우리는 [라인별] 로 열고 있었다. 대조표 둘이 서로 다른 값을 적고 있었던 탓이다 —
   * ecount-mode-default.json 은 '라인별', ecount-radio-options.json 은 '*품목별'.
   * 원본을 열어 가려 보니 라디오 쪽이 맞았다. mode-default 도 같이 고쳤다.
   *
   * <p>라인별로 열면 전표 줄이 그대로 쏟아져, 무엇이 남는 장사인지 보려면 사람이 눈으로
   * 품목을 모아야 한다. 이익현황은 품목으로 접어 보는 것이 첫 화면이다.
   */
  const [mode, setMode] = useState<Mode>('품목별')
  /* 원본 기본 원가는 [선입선출(판매)] 다(2026-10-04 실측 — 라디오가 거기 찍혀 있다). */
  const [basis, setBasis] = useState<Basis>('선입선출(판매)')
  const [withVat, setWithVat] = useState(false)
  /**
   * 원본 [거래구분] — 전체 · 반품만 · 반품제외.
   * 반품 전표는 수량·금액이 음수라 그대로 두면 이익에서 <b>빠진다</b>(그게 맞다).
   * 반품만 보면 되돌아온 것이 얼마인지, 반품제외로 보면 순수 판매만 얼마인지 갈라진다.
   */
  const [tradeKind, setTradeKind] = useState<'전체' | '반품만' | '반품제외'>('전체')
  // 원본 기본값이 금월(~오늘)이다.
  const init = periodOf('금월(~오늘)', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  /*
   * 2026-09-08 에 원본(E040806)의 조건 판을 재니 <b>[전체] 탭이 스물다섯</b>이다
   * ([기본] 탭은 스물둘에 차례도 조금 다르다). 사본에는 열하나뿐이었다. 접힌 줄은 없다.
   *
   * <p>여기서 만든 여섯: 거래처그룹1 · 품목구분 · 품목그룹1 · 담당자 ·
   * 거래처관리담당자 · 거래유형. 값은 판매 전표 응답에 진작 다 있다
   * (월별이익현황과 같은 여섯이다 — 두 화면이 같은 자료를 본다).
   */
  const [cond, setCond] = useState({ from: init.from, to: init.to, warehouseId: '', project: '', partner: '', item: '',
    partnerGroup: '', category: '', itemGroup: '', employee: '', partnerMgr: '', taxType: '' })
  /* 거래처그룹1·거래처관리담당자·품목그룹1 은 마스터에 붙는 값이라 이름·id 로 잇는다. */
  const pgroup = usePartnerGroups()
  const pmgr = usePartnerManagers()
  const mgmtItems = useItemMgmt()
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    /*
     * <b>고른 기간을 서버에도 보낸다.</b> 여태 전표를 통째로 받아 아래에서
     * <code>saleDate &gt;= cond.from</code> 으로 걸렀다. 이 표에는 <b>이월도 누계도 없다</b>
     * (거래처원장·월별채권채무와 다르다) — 그 기간 전표만 있으면 숫자가 같다.
     *
     * <p><b>구매는 좁히면 안 된다</b> — 아래 unitPrices/원가는 그 품목을 <b>언제 샀든</b>
     * 마지막 매입가를 봐야 한다. 기간으로 자르면 이번 달에 안 사 온 품목의 원가가
     * 통째로 빠진다(경영자보고서에서 같은 까닭으로 남겨 둔 자리다).
     */
    const period: Record<string, string> = {}
    if (cond.from) period.from = cond.from
    if (cond.to) period.to = cond.to
    Promise.all([
      api.get<SalesDoc[]>('/sales', { params: period }),
      api.get<Warehouse[]>('/warehouses'),
      api.get<CostRow[]>('/costs'),
      /*
       * <b>마지막 입고단가만 받는다.</b> 아래 lastPurchasePrice 가 하던 일을 서버가 한다 —
       * 그 손계산은 <b>목록 차례에 기대는 옛 규칙</b>이었다(같은 날이면 id 가 작은 쪽이
       * 이긴다). /purchases/item-prices 는 나중에 적은 전표를 마지막 입고로 본다.
       */
      api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
      // 원가 기준 '입고단가(품목)' 은 <b>구매단가</b>다. 판매단가(unitPrice)가 아니다.
      api.get<{ id: number; purchasePrice: number }[]>('/items'),
      /* 원가 [선입선출(판매)] — 그 날까지의 재고 이력으로 판매 줄마다 꺼낸 층의 원가. */
      api.get<{ docNo: string; itemId: number; quantity: number; cost: number }[]>('/stock/fifo-sale-costs', { params: { to: cond.to || ymd(new Date()) } }),
    ])
      .then(([s, w, c, p, i, f]) => {
        setSales(s.data); setWarehouses(w.data); setCosts(c.data); setLastPrices(p.data)
        setFifo(new Map(f.data.filter((r) => Number(r.quantity) > 0)
          .map((r) => [`${r.docNo}#${r.itemId}`, Number(r.cost) / Number(r.quantity)])))
        setUnitPrices(new Map(i.data.map((it) => [it.id, it.purchasePrice])))
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [cond.from, cond.to])

  /** 월별원가는 판매한 <b>그 달</b>의 표준원가를 쓴다 — 기간이 여러 달에 걸쳐도 맞게. */
  const costByItemPeriod = useMemo(
    () => new Map(costs.map((c) => [`${c.itemId}:${c.period}`, c.standardTotal])), [costs])

  /** 그 품목을 마지막으로 산 단가. 서버가 정한 값이다(같은 날이면 나중에 적은 전표). */
  const lastPurchasePrice = useMemo(
    () => new Map(lastPrices.map((r) => [r.itemId, r.unitPrice])), [lastPrices])

  /** 원가단가. 규칙은 utils/costBasis 에 있다 — 거기서 못 박아 두고 여기서는 잇기만 한다. */
  const costPrice = (itemId: number, saleDate: string, docNo: string): number | null => costOf(basis, {
    monthlyCost: costByItemPeriod.get(`${itemId}:${saleDate.slice(0, 7)}`) ?? null,
    lastPurchasePrice: lastPurchasePrice.get(itemId) ?? null,
    itemPurchasePrice: unitPrices.get(itemId) ?? null,
    fifoUnitCost: fifo.get(`${docNo}#${itemId}`) ?? null,
  })

  /** 조건을 통과한 판매 라인 하나하나. 모든 구분이 여기서 갈라져 나간다. */
  const lines = useMemo(() => sales
    .filter((d) => !cond.from || d.saleDate >= cond.from)
    .filter((d) => !cond.to || d.saleDate <= cond.to)
    .filter((d) => !cond.warehouseId || String(d.warehouseId) === cond.warehouseId)
    .filter((d) => !cond.project || String(d.projectId) === cond.project)
    .filter((d) => !cond.partner || String(d.partnerId) === cond.partner)
    .filter((d) => !cond.partnerGroup || pgroup.groupOfName(d.partnerName) === cond.partnerGroup)
    .filter((d) => !cond.employee || (d.employeeName ?? '') === cond.employee)
    .filter((d) => !cond.partnerMgr || pmgr.managerOfName(d.partnerName) === cond.partnerMgr)
    /* 원본 [거래유형] — 과세 · 면세. [거래구분](반품)과 다른 축이다. */
    .filter((d) => !cond.taxType || (d.taxable ? '과세' : '면세') === cond.taxType)
    .filter((d) => tradeKind === '전체'
      || (tradeKind === '반품만' ? d.returnSlip : !d.returnSlip))
    .flatMap((d) => d.lines
      .filter((l) => !cond.item || String(l.itemId) === cond.item)
      .filter((l) => withUntracked || !untracked.has(l.itemId))
      .filter((l) => !cond.category || (l.itemCategoryName ?? '') === cond.category)
      .filter((l) => !cond.itemGroup || mgmtItems.groupOf(l.itemId) === cond.itemGroup)
      .map((l) => {
        const revenue = withVat ? l.supplyAmount + l.vatAmount : l.supplyAmount
        const price = costPrice(l.itemId, d.saleDate, d.docNo)
        const cost = price === null ? null : price * l.quantity
        return {
          key: `${d.id}-${l.itemId}-${l.lotNo ?? ''}`,
          date: d.saleDate, docNo: d.docNo,
          partnerId: d.partnerId, partnerName: d.partnerName,
          itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
          /** 열이 [품목명[규격]] 이다 — 규격을 대괄호로 붙인다(이름만 찍고 있었다, 8회차 화면 점검). */
          itemLabel: l.itemName + (l.spec ? `[${l.spec}]` : ''),
          quantity: l.quantity, revenue, cost,
          profit: cost === null ? null : revenue - cost,
          /** 판매부대비용. 원본 [판매부대비용] 열. 안 적었으면 0 이다. */
          extraCost: Number(l.extraCost ?? 0),
        }
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, cond, tradeKind, withVat, basis, costByItemPeriod, lastPurchasePrice, unitPrices])

  /** 구분에 따라 묶는다. 라인별은 안 묶고, 나머지는 키를 만들어 합친다. */
  const rows = useMemo(() => {
    if (mode === '라인별') {
      return lines.map((l) => ({
        key: l.key, c1: l.date.replace(/-/g, '/'), c2: l.docNo, c3: l.partnerName, c4: l.itemLabel,
        qty: l.quantity, revenue: l.revenue, cost: l.cost, profit: l.profit, count: 1,
        extra: l.extraCost,
      }))
    }
    const keyOf = (l: typeof lines[number]) =>
      mode === '일자별' ? l.date
        : mode === '품목별' ? String(l.itemId)
          : mode === '거래처별' ? String(l.partnerId)
            : mode === '거래처별품목별' ? `${l.partnerId}:${l.itemId}`
              : `${l.itemId}:${l.partnerId}`
    const labelOf = (l: typeof lines[number]) =>
      mode === '일자별' ? [l.date.replace(/-/g, '/'), '', '', '']
        : mode === '품목별' ? [l.itemCode, l.itemLabel, '', '']
          : mode === '거래처별' ? [l.partnerName, '', '', '']
            : mode === '거래처별품목별' ? [l.partnerName, l.itemCode, l.itemLabel, '']
              : [l.itemCode, l.itemLabel, l.partnerName, '']

    const m = new Map<string, { key: string; label: string[]; qty: number; revenue: number; cost: number | null; profit: number | null; count: number; extra: number }>()
    lines.forEach((l) => {
      const k = keyOf(l)
      const g = m.get(k) ?? { key: k, label: labelOf(l), qty: 0, revenue: 0, cost: 0, profit: 0, count: 0, extra: 0 }
      g.qty += l.quantity
      g.revenue += l.revenue
      // 부대비용은 원가를 알든 모르든 다 더한다 — 실제로 쓴 돈이라 빼면 거짓이 된다.
      g.extra += l.extraCost
      // 한 줄이라도 원가를 모르면 그 묶음의 원가·이익은 알 수 없다 — 아는 것만 더해 놓고 맞다고 하면 안 된다.
      if (l.cost === null || g.cost === null) { g.cost = null; g.profit = null }
      else { g.cost += l.cost; g.profit = (g.profit ?? 0) + (l.profit ?? 0) }
      g.count += 1
      m.set(k, g)
    })
    return [...m.values()]
      .sort((a, b) => (mode === '일자별' ? (a.key < b.key ? -1 : 1) : b.revenue - a.revenue))
      .map((g) => ({ key: g.key, c1: g.label[0], c2: g.label[1], c3: g.label[2], c4: g.label[3], qty: g.qty, revenue: g.revenue, cost: g.cost, profit: g.profit, count: g.count, extra: g.extra }))
  }, [lines, mode])

  /**
   * 판매액은 모든 라인이 알 수 있지만 원가·이익은 <b>원가를 아는 라인만</b> 더한다.
   * 이익률까지 전체 판매액으로 나누면 원가를 모르는 만큼 이익률이 좋아 보인다 —
   * 그래서 비율은 아는 라인의 판매액(knownRevenue)으로 낸다.
   */
  const known = lines.filter((l) => l.cost !== null)
  const totals = {
    revenue: lines.reduce((n, l) => n + l.revenue, 0),
    knownRevenue: known.reduce((n, l) => n + l.revenue, 0),
    cost: known.reduce((n, l) => n + (l.cost ?? 0), 0),
    profit: known.reduce((n, l) => n + (l.profit ?? 0), 0),
  }
  /** 판매부대비용과 그것을 뺀 이익. 규칙은 utils/costBasis 에 못 박아 뒀다. */
  const extraTotals = sumExtraCost(lines.map((l) => ({ profit: l.profit, extraCost: l.extraCost })))

  const unknownCost = lines.length - known.length
  const allUnknown = lines.length > 0 && known.length === 0

  const reset = () => {
    setMode('라인별'); setBasis('선입선출(판매)'); setWithVat(false)
    setCond({ from: init.from, to: init.to, warehouseId: '', project: '', partner: '', item: '',
      partnerGroup: '', category: '', itemGroup: '', employee: '', partnerMgr: '', taxType: '' })
    setTradeKind('전체')
  }

  /** 구분마다 앞쪽 라벨 열이 다르다. 열 수가 바뀌므로 한 곳에서 정한다. */
  const HEADS: Record<Mode, string[]> = {
    일자별: ['일자'],
    라인별: ['일자', '전표번호', '거래처', '품목'],
    /* 원본은 규격을 품목명 뒤 대괄호에 붙여 <b>[품목명[규격]]</b> 한 칸으로 적는다. */
    품목별: ['품목코드', '품목명[규격]'],
    거래처별: ['거래처'],
    품목별거래처별: ['품목코드', '품목명[규격]', '거래처'],
    거래처별품목별: ['거래처', '품목코드', '품목명[규격]'],
  }
  const heads = HEADS[mode]
  /*
   * 꼬리 열 <b>아홉</b> — 판매(수량 · 단가 · 금액) · 원가(단가 · 금액) · 부대비용 · 이익(단가 · 금액) · 이익율.
   * 원본 두 줄 머리의 잎이다.
   */
  const TAIL = 9
  /** 합계행의 단가도 <b>합계금액 ÷ 합계수량</b>이다 — 줄 단가의 평균이 아니다. */
  const totalQty = rows.reduce((n, r) => n + r.qty, 0)
  const colCount = 1 + heads.length + (mode === '일자별' || mode === '거래처별' ? 1 : 0) + TAIL
  /** 수량으로 나눈 단가. 수량이 없으면 <b>0 이 아니라 모른다</b>(null). */
  const per = (amount: number | null, qty: number) =>
    (amount === null || qty === 0 ? null : amount / qty)

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '일별이익현황', [mode, basis, withVat, rows.length])

  return (
    <EcListShell
      title="일별이익현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        /*
         * 원본에도 같은 이름의 버튼이 있다. 이익이 0 으로 나오는 까닭은 대개 정해져 있어서,
         * 화면 어딘가에 적어 두지 않으면 "자료가 없나" 하고 되돌아 나가게 된다.
         * 원본 안내문을 옮긴 것이 아니라 <b>우리 계산 규칙</b>을 적은 것이다.
         */
        // 원본 차례: 인쇄 · Excel · 이익이 안 나올 경우 (사본 실측)
        { label: '인쇄' },
        { label: 'Excel' },
        { label: '이익이 안 나올 경우', onClick: () => setWhyOpen(true) },
        { label: '다시 작성', onClick: reset },
      ]}
      signLine={signBox}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouseId} onChange={(v) => setC({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        {/*
          원본 [전체] 탭 차례(2026-09-08 실측, 스물다섯): 구분 · 기준일자 · 창고 ·
          (창고계층그룹) · 거래처 · <b>거래처그룹1</b> · (거래처그룹2 · 거래처계층그룹) ·
          품목 · <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · 프로젝트 ·
          (프로젝트그룹1/2) · <b>담당자 · 거래처관리담당자 · 거래유형</b> · 판매액 · 원가 ·
          거래구분 · 기타 · 정렬/소계기준.
          <b>[기본] 탭은 스물둘</b>이고 차례가 다르다(프로젝트가 창고 다음, 거래구분이
          기타 다음). 조건이 더 많은 [전체] 쪽에 맞춘다 — 월별이익현황과 같은 규칙이다.
        */}
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="거래처그룹1" pick>
          <CodePickerField label="거래처그룹1" hideLabel width={170} emptyLabel="전체"
                           value={cond.partnerGroup} onChange={(v) => setC({ partnerGroup: v })}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체"
                           value={cond.category} onChange={(v) => setC({ category: v })}
                           items={[...new Set(sales.flatMap((d) => d.lines.map((l) => l.itemCategoryName))
                             .filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                           value={cond.itemGroup} onChange={(v) => setC({ itemGroup: v })}
                           items={mgmtItems.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={140} emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setC({ employee: v })}
                           items={[...new Set(sales.map((d) => d.employeeName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={cond.partnerMgr} onChange={(v) => setC({ partnerMgr: v })}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="거래유형">
          <div className="ec-pills">
            {['', '과세', '면세'].map((v) => (
              <button key={v || 'all'} type="button"
                      className={'ec-pill no-ec' + (cond.taxType === v ? ' active' : '')}
                      onClick={() => setC({ taxType: v })}>{v || '전체'}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="판매액">
          <div className="ec-pills">
            {([['공급가액', false], ['공급가액+VAT', true]] as const).map(([label, v]) => (
              <button key={label} type="button" className={`ec-pill no-ec${withVat === v ? ' active' : ''}`}
                      onClick={() => setWithVat(v)}>
                {label}
              </button>
            ))}
          </div>
        </EcCond>
        {/* 원본 조건의 [거래구분]. 반품 전표는 수량·금액이 음수라 이익에서 저절로 빠진다. */}
        <EcCond label="원가">
          <div className="ec-pills">
            {(['선입선출(판매)', '월별원가', '최종구매가', '입고단가(품목)'] as const).map((b) => (
              <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                      onClick={() => setBasis(b)}>
                {b}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="거래구분">
          <div className="ec-pills">
            {(['전체', '반품만', '반품제외'] as const).map((k) => (
              <button key={k} type="button" className={`ec-pill no-ec${tradeKind === k ? ' active' : ''}`}
                      onClick={() => setTradeKind(k)}>{k}</button>
            ))}
          </div>
        </EcCond>
        {/* 원본 [기타] — 결재방표시와 같은 줄에 선다(사본 실측). */}
        <EcCond label="수량관리제외품목포함">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
            재고수량을 안 세는 품목도
          </label>
        </EcCond>
        <EcCond label="결재방표시">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {unknownCost > 0 && (
        <p style={{ marginBottom: 8, background: 'var(--ec-warn-bg)', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          <b>{num(unknownCost)}</b>개 라인의 {basis} 를 찾지 못했습니다. 그 줄의 원가·이익은 <b>'—'</b> 로 두고
          합계에서도 뺐습니다 — 0 으로 채우면 이익이 매출 전액으로 부풀어 오릅니다.
        </p>
      )}

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        {mode === '라인별' ? '라인' : '줄'} <b className="text-ec-text">{num(rows.length)}</b>
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        판매액 <b className="text-ec-blue text-[14px]">{won(totals.revenue)}</b>
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        원가 <b style={{ color: allUnknown ? 'var(--ec-text-off)' : '#a5561b', fontSize: 14 }}>{allUnknown ? '—' : won(totals.cost)}</b>
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        이익 <b style={{ color: allUnknown ? 'var(--ec-text-off)' : totals.profit < 0 ? 'var(--ec-danger)' : 'var(--ec-success)', fontSize: 14 }}>
          {allUnknown ? '—' : won(totals.profit)}
        </b>
        {!allUnknown && <span className="text-ec-hint"> ({rate(totals.profit, totals.knownRevenue)}%)</span>}
      </div>

      <div ref={tableRef} className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            {/*
              <b>2026-10-04 원본 격자 실측</b>(품목별, 자료가 든 판) — 머리는 <b>두 줄</b>이다.
              위: 품목코드 · 품목명[규격] · 판매(3) · 원가(2) · 부대비용 · 이익(2) · 이익율, 아래: 판매 밑 [수량 · 단가 · 금액],
              원가 · 이익 밑 [단가 · 금액]. 예전엔 한 줄 머리에 [판매단가] 처럼 묶음 이름을 붙였고, 09-09 기록대로
              [이익금액(부대비용포함)] · [판매부대비용] 을 맨 뒤에 두었는데 지금 원본 기본 판에는 [부대비용] 한 칸뿐이다.
              앞머리 칸은 [구분]에 따라 갈려 <code>HEADS</code> 가 든다.
            */}
            <tr>
              <th rowSpan={2} className="w-[40px]"></th>
              {heads.map((h) => <th key={h} rowSpan={2}>{h}</th>)}
              {(mode === '일자별' || mode === '거래처별') && <th rowSpan={2} className="text-right w-[70px]">건수</th>}
              <th colSpan={3} className="text-center">판매</th>
              <th colSpan={2} className="text-center">원가</th>
              <th rowSpan={2} className="text-right w-[110px]">부대비용</th>
              <th colSpan={2} className="text-center">이익</th>
              <th rowSpan={2} className="text-right w-[80px]">이익율</th>
            </tr>
            <tr>
              <th className="text-right w-[90px]">수량</th>
              <th className="text-right w-[110px]">단가</th>
              <th className="text-right w-[120px]">금액</th>
              <th className="text-right w-[110px]">단가</th>
              <th className="text-right w-[120px]">금액</th>
              <th className="text-right w-[110px]">단가</th>
              <th className="text-right w-[120px]">금액</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="text-center text-ec-ink">불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r, i) => {
              const color = r.profit === null ? 'var(--ec-text-off)' : r.profit > 0 ? 'var(--ec-success)' : r.profit < 0 ? 'var(--ec-danger)' : undefined
              return (
                <tr key={r.key}>
                  <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
                  {heads.map((h, hi) => (
                    <td key={h} style={hi === 0 && (mode === '품목별' || mode === '품목별거래처별') ? { fontFamily: 'monospace' } : undefined}>
                      {[r.c1, r.c2, r.c3, r.c4][hi]}
                    </td>
                  ))}
                  {(mode === '일자별' || mode === '거래처별') && (
                    <td className="text-right text-ec-hint">{num(r.count)}</td>
                  )}
                  <td className="text-right">{num(r.qty)}</td>
                  <td className="text-right text-ec-label">
                    {per(r.revenue, r.qty) === null ? '—' : won(Math.round(per(r.revenue, r.qty) as number))}
                  </td>
                  <td className="text-right text-ec-blue">{won(r.revenue)}</td>
                  <td className="text-right text-ec-label">
                    {per(r.cost, r.qty) === null ? '—' : won(Math.round(per(r.cost, r.qty) as number))}
                  </td>
                  <td className="text-right">{r.cost === null ? '—' : won(r.cost)}</td>
                  <td className="text-right">{won(r.extra)}</td>
                  <td className="text-right">
                    {per(r.profit, r.qty) === null ? '—' : won(Math.round(per(r.profit, r.qty) as number))}
                  </td>
                  <td className="text-right" style={{ color }}>{r.profit === null ? '—' : won(r.profit)}</td>
                  <td className="text-right" style={{ color }}>{r.profit === null ? '—' : `${rate(r.profit, r.revenue)}%`}</td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={colCount - TAIL} className="text-right font-bold bg-ec-page">합계</td>
                {/* 원본 합계 줄은 단가 칸을 비운다(2026-10-04 실측: 72 · · 1,885,292 · · 1,113,858 · 0 · · 771,434 · 41%). */}
                <td className="text-right font-bold bg-ec-page">{num(totalQty)}</td>
                <td className="bg-ec-page"></td>
                <td className="text-right font-bold bg-ec-page">{won(totals.revenue)}</td>
                <td className="bg-ec-page"></td>
                <td className="text-right font-bold bg-ec-page">{allUnknown ? '—' : won(totals.cost)}</td>
                <td className="text-right font-bold bg-ec-page">{won(extraTotals.extra)}</td>
                <td className="bg-ec-page"></td>
                <td className="text-right font-bold bg-ec-page">{allUnknown ? '—' : won(totals.profit)}</td>
                <td className="text-right font-bold bg-ec-page">{allUnknown ? '—' : `${rate(totals.profit, totals.knownRevenue)}%`}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Modal error={error} open={whyOpen} title="이익이 안 나올 경우" onClose={() => setWhyOpen(false)}>{(
        <div style={{ fontSize: 12.5, lineHeight: 1.9, color: '#3f4855' }}>
          이익 = 판매액 − (판매수량 × 원가단가) 입니다. 원가단가를 못 찾으면 이익 칸이 비거나
          판매액과 같아집니다. 아래를 차례로 보세요.
          <ol style={{ margin: '10px 0 0 20px', listStyleType: 'decimal' }}>
            <li>[원가] 를 [월별원가]로 두었다면 그 달 <b>표준원가가 생성돼 있어야</b> 합니다 —
                [원가생성/수정]에서 그 기준월로 만듭니다.</li>
            <li>[최종구매가]·[입고단가(품목)]는 그 품목을 <b>사 본 적이 있어야</b> 값이 잡힙니다.</li>
            <li>기간에 판매 전표가 없으면 줄 자체가 없습니다 — [기준일자]를 넓혀 보세요.</li>
            <li>[구분]이 품목별인데 전표에 품목이 없으면(수동 금액 전표) 그 줄은 빠집니다.</li>
          </ol>
        </div>
      )}</Modal>
    </EcListShell>
  )
}
