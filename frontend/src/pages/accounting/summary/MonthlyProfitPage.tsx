import { useRef, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import type { SalesDoc } from '../../../types/api'
import EcListShell from '../../../components/EcListShell'
import { EcReportHead, EcReportFoot } from '../../../components/EcReportFrame'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { EcCond, EcCondTabs } from '../../../components/EcStatusPanel'
import { ecAlert } from '../../../components/EcDialog'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../../utils/useCondPickers'
import { useItemFlags } from '../../../utils/useInactiveItems'
import { useItemMgmt } from '../../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../../utils/partnerGroups'
import { usePartnerManagers } from '../../../utils/partnerManagers'
import { fmtAmount } from '../../../utils/format'

/** 원본 [Option] (이익관리 현황 3화면 2026-10-22 실측) — 검색항목설정 · 양식설정 ▸(✓ 기본(수정불가) · ✓ 현재 양식 · 신규양식추가). 양식 · 검색항목 디자이너는 두지 않는다. */
const OPTION_MENU = [
  { label: '검색항목설정', onClick: () => void ecAlert('검색항목설정은 지원하지 않습니다.') },
  { label: '양식설정', onClick: () => void ecAlert('양식설정은 지원하지 않습니다(양식 하나).') },
]

/**
 * 이익관리 > 월별이익현황(E040805)
 *
 * <p><b>2026-10-13 원본 실측(loginaa, 기준월 2026/09 ~ 2026/09 (총평균법))</b>
 * <ul>
 *   <li>[기준월]은 달 고르기가 아니라 <b>코드도움</b>이다 — 원가생성/수정(E040802)에서 만든 원가 기간
 *       ('재고월별원가' 창: 기준월 · 원가계산방법 · 소모량기준)을 하나 고른다. 기본은 맨 위(최근) 기간.
 *       비워 두고 [검색(F8)] 을 누르면 안내 없이 칸에 빨간 테두리만 두르고 검색하지 않는다.</li>
 *   <li>원가는 그 기간에 <b>생성한 원가</b>다(같은 품목이면 줄마다 같은 단가 — A001 28,426).
 *       [원가] 고르기는 일별이익현황에만 있다. 예전 우리는 [연도] · 달 두 칸 · [원가] 넷 · [구분] 다섯째 '월별' 을
 *       두었는데 원본에 없다.</li>
 *   <li>격자 머리 두 줄: 앞머리 · 판매(수량 · 단가 · 금액) · 원가(단가 · 금액) · 판매부대비용 · 이익(단가 · 금액) · 이익율.
 *       <b>이익은 부대비용까지 뺀다</b>(314,500,000 − 5,258,888 − 1,000 = 309,240,112). 부대비용 0 은 빈칸.
 *       번호 열 · [건수] 는 없다. 차례는 코드 순. 합계 줄은 단가 칸을 비운다. 이익율은 정수 %.</li>
 *   <li>표 위 제목은 [구분]마다 품목별이익현황 · 거래처별이익현황 · 품목/거래처별이익현황 · 거래처/품목별이익현황,
 *       거래처 칸은 [거래처코드 · 거래처명] 두 칸이다.</li>
 * </ul>
 * '소모량기준'(실소모량) 열은 우리 원가 기간이 들지 않아 창에 없다.
 */
type Mode = '품목별' | '거래처별' | '품목별거래처별' | '거래처별품목별'
const MODES = ['품목별', '거래처별', '품목별거래처별', '거래처별품목별'] as const
const REPORT_TITLE: Record<Mode, string> = {
  품목별: '품목별이익현황', 거래처별: '거래처별이익현황',
  품목별거래처별: '품목/거래처별이익현황', 거래처별품목별: '거래처/품목별이익현황',
}

/**
 * 원가생성/수정이 만든 원가계산내역 한 줄(GET /cost-periods/{id}/ledger).
 * <b>원본 [원가] 단가는 그 기간 실제원가다</b>(2026-10-20 E040805 실측: A001 원가 단가 27,621 · 금액 5,109,899 =
 * 185 × 27,621.07 — 실제원가현황 감소 단가). 우리는 표준원가(/costs standardTotal)를 쓰고 있어,
 * 표준원가를 안 넣은 회사는 원가 · 이익이 전부 '—' 였다.
 */
interface CostLedgerRow {
  itemId: number; openingQty: number; openingAmount: number; increaseQty: number; increaseAmount: number
  decreaseQty: number; decreaseAmount: number
}
/** 감소(판매 출고 포함) 단가 — 감소가 없으면 (기초 + 증가) ÷ 수량. 금액이 0 이면 원가를 모른다(null). */
function unitCostOf(r: CostLedgerRow): number | null {
  const [amt, qty] = Number(r.decreaseQty) > 0
    ? [Number(r.decreaseAmount), Number(r.decreaseQty)]
    : [Number(r.openingAmount) + Number(r.increaseAmount), Number(r.openingQty) + Number(r.increaseQty)]
  return qty > 0 && amt > 0 ? amt / qty : null
}
interface CostPeriod { id: number; startMonth: string; endMonth: string; methodName: string; latest: boolean }

const num = (n: number) => n.toLocaleString()
/** 원본 이익율은 정수 % 다(98% · -8%). */
const rate = (profit: number, revenue: number) => (revenue === 0 ? 0 : Math.round((profit / revenue) * 100))
/** 원본은 0 을 찍지 않는다 — 판매금액 0 인 줄(A003 수량 2)은 단가 · 금액 · 이익 · 이익율이 모두 빈칸. */
const nz = (n: number | null) => (n == null || Math.round(n) === 0 ? '' : fmtAmount(n))
const rateText = (profit: number, revenue: number) => (revenue === 0 ? '' : `${rate(profit, revenue)}%`)
const ymSlash = (ym: string) => ym.replace('-', '/')
const periodText = (p: CostPeriod) => `${ymSlash(p.startMonth)} ~ ${ymSlash(p.endMonth)} (${p.methodName})`
/** 그 달의 마지막 날 — 'YYYY-MM' → 'YYYY-MM-DD'. */
const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

export default function MonthlyProfitPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])
  /*
   * 원본 [기타]의 <b>[수량관리제외품목포함]</b> — 기본 <b>켜짐</b>, [결재방표시] 는 꺼짐(사본 실측).
   */
  const [withUntracked, setWithUntracked] = useState(true)
  const { untracked } = useItemFlags()
  const [signBox, setSignBox] = useState(false)
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [ledger, setLedger] = useState<CostLedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  /* 원본 [기준월] — 원가 기간 코드도움. 기본은 최근 기간. */
  const [periods, setPeriods] = useState<CostPeriod[]>([])
  const [periodId, setPeriodId] = useState('')
  const [periodMissing, setPeriodMissing] = useState(false)
  /** 검색한 때의 기간 — 표 위 기간 글자와 판매 거르기는 이 값을 쓴다. */
  const [shown, setShown] = useState<CostPeriod | null>(null)
  const [mode, setMode] = useState<Mode>('품목별')
  const [shownMode, setShownMode] = useState<Mode>('품목별')
  const [withVat, setWithVat] = useState(false)
  const [cond, setCond] = useState({ warehouse: '', project: '', partner: '', item: '',
    partnerGroup: '', category: '', itemGroup: '', employee: '', partnerMgr: '', taxType: '' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load(pid = periodId, list = periods) {
    const p = list.find((x) => String(x.id) === pid)
    if (!p) { setPeriodMissing(true); return }
    setPeriodMissing(false)
    setLoading(true)
    setError('')
    Promise.all([
      api.get<SalesDoc[]>('/sales', { params: { from: `${p.startMonth}-01`, to: monthEnd(p.endMonth) } }),
      api.get<{ rows: CostLedgerRow[] }>(`/cost-periods/${p.id}/ledger`),
    ])
      .then(([s, c]) => { setSales(s.data); setLedger(c.data.rows); setShown(p); setShownMode(mode) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api.get<CostPeriod[]>('/cost-periods')
      .then((r) => {
        setPeriods(r.data)
        const first = r.data.find((p) => p.latest) ?? r.data[0]
        if (first) { setPeriodId(String(first.id)); load(String(first.id), r.data) }
      })
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 그 달의 생성 원가(단가). 원가 기간이 여러 달이면 판 달의 것을 쓴다. */
  const unitCost = useMemo(() => new Map(ledger.map((r) => [r.itemId, unitCostOf(r)])), [ledger])
  const costPrice = (itemId: number): number | null => unitCost.get(itemId) ?? null
  const partnerCode = useMemo(
    () => new Map(pickers.partners.map((p) => [p.value, p.code ?? ''])), [pickers.partners])

  /**
   * 원본 [관리항목]. 품목 마스터에 붙는 값이라 판매 전표 응답에는 없다 —
   * 품목 마스터를 받아 <b>줄의 itemId 로 화면에서 잇는다</b>(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')
  /* 거래처그룹1·거래처관리담당자는 거래처 마스터에 붙는 값이라 이름으로 잇는다. */
  const pgroup = usePartnerGroups()
  const pmgr = usePartnerManagers()

  const lines = useMemo(() => sales
    .filter((d) => !shown || (d.saleDate.slice(0, 7) >= shown.startMonth && d.saleDate.slice(0, 7) <= shown.endMonth))
    .filter((d) => !cond.warehouse || String(d.warehouseId) === cond.warehouse)
    .filter((d) => !cond.project || String(d.projectId) === cond.project)
    .filter((d) => !cond.partner || String(d.partnerId) === cond.partner)
    .filter((d) => !cond.partnerGroup || pgroup.groupOfName(d.partnerName) === cond.partnerGroup)
    .filter((d) => !cond.employee || (d.employeeName ?? '') === cond.employee)
    .filter((d) => !cond.partnerMgr || pmgr.managerOfName(d.partnerName) === cond.partnerMgr)
    /* 원본 [거래유형] — 과세 · 면세. 전표가 그 값을 든다. */
    .filter((d) => !cond.taxType || (d.taxable ? '과세' : '면세') === cond.taxType)
    .flatMap((d) => d.lines
      .filter((l) => !cond.item || String(l.itemId) === cond.item)
      .filter((l) => withUntracked || !untracked.has(l.itemId))
      .filter((l) => !mgmtCond || mgmt.nameOf(l.itemId) === mgmtCond)
      .filter((l) => !cond.category || (l.itemCategoryName ?? '') === cond.category)
      .filter((l) => !cond.itemGroup || mgmt.groupOf(l.itemId) === cond.itemGroup)
      .map((l) => {
        const revenue = withVat ? l.supplyAmount + l.vatAmount : l.supplyAmount
        const price = costPrice(l.itemId)
        /* 원가를 모르는 품목(원가계산내역에 금액이 없음)은 원본도 원가 칸을 비우고 이익 = 판매금액(이익율 100%) 이다(L004 실측). */
        const cost = price === null ? 0 : price * l.quantity
        /** 판매부대비용 — 전표 합계에 안 들어가는 우리가 쓴 돈이다. 원본은 이익에서 뺀다. */
        const extraCost = Number(l.extraCost ?? 0)
        return {
          partnerId: d.partnerId, partnerCode: partnerCode.get(String(d.partnerId)) ?? '', partnerName: d.partnerName,
          itemId: l.itemId, itemCode: l.itemCode,
          /** 열이 [품목명[규격]] 이다 — 원본은 이름 뒤 한 칸 띄우고 대괄호(울트라 스킨 [140ml]). */
          itemLabel: l.itemName + (l.spec ? ` [${l.spec}]` : ''),
          quantity: l.quantity, revenue, cost, extraCost,
          profit: revenue - cost - extraCost,
        }
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, shown, cond, withVat, unitCost, partnerCode, withUntracked, mgmtCond])

  const rows = useMemo(() => {
    const keyOf = (l: typeof lines[number]) =>
      shownMode === '품목별' ? String(l.itemId)
        : shownMode === '거래처별' ? String(l.partnerId)
          : shownMode === '거래처별품목별' ? `${l.partnerId}:${l.itemId}`
            : `${l.itemId}:${l.partnerId}`
    const labelOf = (l: typeof lines[number]) =>
      shownMode === '품목별' ? [l.itemCode, l.itemLabel]
        : shownMode === '거래처별' ? [l.partnerCode, l.partnerName]
          : shownMode === '거래처별품목별' ? [l.partnerCode, l.partnerName, l.itemCode, l.itemLabel]
            : [l.itemCode, l.itemLabel, l.partnerCode, l.partnerName]
    const m = new Map<string, { key: string; label: string[]; qty: number; revenue: number; cost: number; profit: number; extra: number }>()
    lines.forEach((l) => {
      const k = keyOf(l)
      const g = m.get(k) ?? { key: k, label: labelOf(l), qty: 0, revenue: 0, cost: 0, profit: 0, extra: 0 }
      g.qty += l.quantity
      g.revenue += l.revenue
      g.extra += l.extraCost
      g.cost += l.cost
      g.profit += l.profit
      m.set(k, g)
    })
    /* 원본 차례는 앞머리 코드 순이다(A001 · B001 …, 1234567002 · 1234567004 …). */
    return [...m.values()].sort((a, b) => a.label.join('\u0000').localeCompare(b.label.join('\u0000')))
  }, [lines, shownMode])

  const totals = {
    revenue: lines.reduce((n, l) => n + l.revenue, 0),
    cost: lines.reduce((n, l) => n + l.cost, 0),
    profit: lines.reduce((n, l) => n + l.profit, 0),
    extra: lines.reduce((n, l) => n + l.extraCost, 0),
    qty: lines.reduce((n, l) => n + l.quantity, 0),
  }

  /** 구분마다 앞머리 칸이 다르다. 원본 실측 글자 그대로. */
  const HEADS: Record<Mode, string[]> = {
    품목별: ['품목코드', '품목명[규격]'],
    거래처별: ['거래처코드', '거래처명'],
    품목별거래처별: ['품목코드', '품목명[규격]', '거래처코드', '거래처명'],
    거래처별품목별: ['거래처코드', '거래처명', '품목코드', '품목명[규격]'],
  }
  const heads = HEADS[shownMode]
  const TAIL = 9
  const colCount = heads.length + TAIL
  const per = (v: number, q: number) => (q === 0 ? null : v / q)

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '월별이익현황', [shownMode, withVat, rows.length])

  const reset = () => {
    setCond({ warehouse: '', project: '', partner: '', item: '',
      partnerGroup: '', category: '', itemGroup: '', employee: '', partnerMgr: '', taxType: '' })
    setMgmtCond(''); setMode('품목별'); setWithVat(false); setWithUntracked(true); setSignBox(false)
    const first = periods.find((p) => p.latest) ?? periods[0]
    setPeriodId(first ? String(first.id) : '')
  }

  return (
    <EcListShell
      title="월별이익현황"
      formMenu={{ current: REPORT_TITLE[mode] }}
      optionMenu={OPTION_MENU}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => load() },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[10px]">
        <EcCondTabs />
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="기준월" pick>
          <span className={periodMissing ? 'rounded-ec outline outline-1 outline-ec-danger' : undefined}>
            <CodePickerField label="기준월" hideLabel width={260} placeholder="기준월"
                             value={periodId} onChange={(v) => { setPeriodId(v); if (v) setPeriodMissing(false) }}
                             items={periods.map((p) => ({ value: String(p.id), name: periodText(p) }))} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouse} onChange={(v) => setC({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        {/*
          원본 [전체] 탭 차례(2026-09-08 실측, 스물넷): 구분 · 기준월 · 창고 ·
          (창고계층그룹) · 거래처 · <b>거래처그룹1</b> · (거래처그룹2 · 거래처계층그룹) ·
          품목 · <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · 프로젝트 ·
          (프로젝트그룹1/2) · 관리항목 · <b>담당자 · 거래처관리담당자 · 거래유형</b> ·
          판매액 · 기타 · 정렬/소계기준.
          <b>[기본] 탭은 스물하나</b>고 차례가 조금 다르다(프로젝트·관리항목이 앞으로 온다).
        */}
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
                           items={mgmt.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        {/*
          <b>[프로젝트]·[관리항목]의 자리가 탭마다 다르다.</b> [기본] 탭은 창고 다음이고
          [전체] 탭은 품목그룹1 다음이다(2026-09-08 실측). 조건이 더 많은 <b>[전체]</b>
          차례에 맞춘다 — 우리가 이번에 만든 담당자·거래처관리담당자·거래유형이 거기 있다.
        */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
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
                      onClick={() => setWithVat(v)}>{label}</button>
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
      </ul>


      {shown && <EcReportHead title={REPORT_TITLE[shownMode]} period={`${ymSlash(shown.startMonth)} ~ ${ymSlash(shown.endMonth)}`} />}
      <div ref={tableRef} className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {heads.map((h) => <th key={h} rowSpan={2}>{h}</th>)}
              <th colSpan={3} className="text-center">판매</th>
              <th colSpan={2} className="text-center">원가</th>
              <th rowSpan={2} className="text-right w-[110px]">판매부대비용</th>
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
              <tr><td colSpan={colCount} className="ec-empty">불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key}>
                {heads.map((h, hi) => <td key={h}>{r.label[hi]}</td>)}
                <td className="text-right">{num(r.qty)}</td>
                <td className="text-right">{nz(per(r.revenue, r.qty))}</td>
                <td className="text-right">{nz(r.revenue)}</td>
                <td className="text-right">{nz(per(r.cost, r.qty))}</td>
                <td className="text-right">{nz(r.cost)}</td>
                <td className="text-right">{r.extra === 0 ? '' : fmtAmount(r.extra)}</td>
                <td className="text-right">{nz(per(r.profit, r.qty))}</td>
                <td className="text-right">{nz(r.profit)}</td>
                <td className="text-right">{rateText(r.profit, r.revenue)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                {/* 원본 합계 줄은 단가 칸을 비운다(2026-10-13 실측: 합계 6,771 · · 587,680,000 · · 268,357,011 · 2,000 · · 319,320,989 · 54%). */}
                <td colSpan={heads.length} className="text-center font-bold bg-ec-page">합계</td>
                <td className="text-right font-bold bg-ec-page">{num(totals.qty)}</td>
                <td className="bg-ec-page"></td>
                <td className="text-right font-bold bg-ec-page">{nz(totals.revenue)}</td>
                <td className="bg-ec-page"></td>
                <td className="text-right font-bold bg-ec-page">{nz(totals.cost)}</td>
                <td className="text-right font-bold bg-ec-page">{totals.extra === 0 ? '' : fmtAmount(totals.extra)}</td>
                <td className="bg-ec-page"></td>
                <td className="text-right font-bold bg-ec-page">{nz(totals.profit)}</td>
                <td className="text-right font-bold bg-ec-page">{rateText(totals.profit, totals.revenue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {shown && <EcReportFoot />}
    </EcListShell>
  )
}
