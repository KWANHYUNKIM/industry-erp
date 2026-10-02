import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { printDocuments } from '../../utils/printDocument'
import { stockCostMapFromLast } from '../../utils/stockValue'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'

/**
 * 재고 > 창고이동현황 (이카운트 E040505)
 *
 * 창고이동은 재고 총량을 바꾸지 않아서 수불부에서 눈에 안 띈다. 그래서 "분명히 있었는데
 * 창고에 없다"가 생기면 여기부터 본다. 우리는 입력(`/inventory/transfer`)만 있고 현황이 없었다.
 *
 * 원본 [구분]은 <b>내역 / 집계 / 라인별</b>인데, 우리 창고이동 전표는 <b>한 줄짜리</b>라
 * 내역과 라인별이 같은 표가 된다. 없는 구분을 흉내내지 않고 [내역|집계] 둘만 둔다.
 * 집계는 <b>출고창고 → 입고창고 × 품목</b>으로 묶는다 — "어느 창고에서 어디로 얼마나 흘렀나".
 *
 * 원본 조건 중 프로젝트·담당자는 StockTransfer 에 없어 넣지 않았다.
 * 창고 조건은 출고·입고 <b>어느 쪽이든</b> 걸리면 잡는다(한쪽만 보면 이동의 반쪽만 보인다).
 */
interface Transfer {
  id: number
  transferNo: string
  transferDate: string
  /** 원본 조건의 [프로젝트]·[담당자]. 담당자는 id 만 온다 — 이름은 화면이 붙인다. */
  projectId: number | null
  projectName: string | null
  employeeId: number | null
  itemId: number
  itemCode: string
  itemName: string
  /** 열이 [품목명[규격]] 이다 — 응답이 진작 싣는데 받지 않아 이름만 찍었다. */
  spec: string | null
  unit: string
  fromWarehouseId: number
  fromWarehouseName: string
  toWarehouseId: number
  toWarehouseName: string
  quantity: number
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  itemCategoryName: string | null
  reason: string | null
  createdBy: string | null
  /** 원본 조건 [최초작성일자]·[최종작업일자], [기타]의 수정일자순(정렬). */
  createdAt: string | null
  updatedAt: string | null
}

const num = (n: number) => n.toLocaleString()

/**
 * 원본 창고이동조회의 마지막 열 <b>[인쇄]</b> — 그 한 건을 이동증으로 찍는다.
 *
 * <p>금액 칸은 안 그린다. 창고이동은 <b>사내 이동</b>이라 금액이 없다 —
 * 0 으로 채워 그리면 "0원짜리 거래" 로 읽힌다. 공급자/공급받는자 칸도 없다(상대가 없다).
 * 생산불출증과 같은 규칙이다.
 */
async function printTransfer(r: Transfer) {
  await printDocuments([{
    title: '창고이동증',
    docNo: r.transferNo,
    docDate: r.transferDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '보내는창고', value: r.fromWarehouseName },
      { label: '받는창고', value: r.toWarehouseName },
      { label: '프로젝트', value: r.projectName },
    ],
    remark: r.reason,
    lines: [{
      itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
      quantity: r.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    }],
  }])
}

export default function TransferStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'projects', 'employees'])
  const [rows, setRows] = useState<Transfer[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  /* 평가단가를 내는 재료. 품목 마스터의 구매단가와 실제 입고단가(구매전표)다. */
  const [costById, setCostById] = useState<Map<number, number | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  // 원본 기본값이 금월(~오늘)이다.
  /*
   * 원본 창고이동조회(E040502)는 <b>최근30일(+1개월)</b> 로 열린다(2026-09-07 실측 —
   * 간편검색 칸에 그 이름이 적혀 있다). '금월(~오늘)' 이라 적어 두었던 것은 근거가 없었다.
   * 이동은 <b>앞으로 옮길 것</b>도 잡아야 해서 미래가 한 달 들어간다.
   */
  const init = periodOf('최근30일(+1개월)', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  /*
   * 원본 창고이동조회 조건 차례: … 창고 · <b>프로젝트</b> · 품목 · <b>담당자</b> · 적요.
   * 이동 전표에 그 칸이 없어 <b>[적요]에 손으로 적고</b> 있었다 — 칸을 만들고 조건을 세운다.
   */
  const [cond, setCond] = useState({
    from: init.from, to: init.to, warehouseId: '', project: '', item: '', employee: '', reason: '',
    /*
     * 2026-09-07 에 원본(E040502)을 열어 조건을 전부 쟀다 — <b>스물아홉</b>이다.
     * 사본에는 아홉뿐이었고 <b>[기준일자]도 [보내는창고]·[받는창고]도 빠져 있었다</b>.
     * 이동 화면에서 어디서 어디로가 빠진 사본이라니 — 여섯 번째 같은 구멍이다.
     *
     * <p>[창고]는 <b>어느 쪽이든</b> 걸리는 칸이고, [보내는창고]·[받는창고]는 <b>한쪽만</b>
     * 건다. 셋이 나란히 있는 까닭이 그것이다 — "저 창고가 낀 이동" 과 "저 창고에서 나간
     * 이동" 은 다른 물음이다.
     */
    fromWarehouseId: '', toWarehouseId: '',
    category: '', itemGroup: '', author: '',
    madeFrom: '', madeTo: '', editedFrom: '', editedTo: '',
    /*
     * 2026-09-08 에 <b>창고이동현황</b>(E040505)도 열어 쟀다 — <b>스물아홉</b>이다
     * (사본에는 여덟). 조회 쪽과 이름이 거의 같은데 <b>[수량]</b> 이 하나 더 있다.
     * 그 값은 표에 진작 찍고 있었는데 거를 자리가 없었다.
     */
    qtyFrom: '', qtyTo: '',
  })
  /** 원본 [기타] — 이 화면에서는 <b>수정일자순(정렬)</b> 하나다(실측). */
  const [byUpdated, setByUpdated] = useState(false)
  /** 원본 [품목그룹1]. 품목 마스터에 붙는 값이라 마스터를 받아 itemId 로 잇는다. */
  const mgmt = useItemMgmt()
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Transfer[]>('/stock-transfers', { params: { from: cond.from || undefined, to: cond.to || undefined } }),
      api.get<Warehouse[]>('/warehouses'),
      /*
       * 원본 [금액(수량*입고단가)] 을 내는 재료. 기간을 안 건다 —
       * 이번 달에 안 샀다고 그 품목의 입고단가가 사라지면 안 된다.
       */
      api.get<{ id: number; purchasePrice?: number }[]>('/items'),
      /*
       * <b>마지막 입고단가만 받는다.</b> 이 화면이 구매로 하는 일은 평가단가 지도
       * 하나를 만드는 것뿐인데 구매 전표를 통째로 받고 있었다(실측 984KB).
       * /purchases/item-prices 는 품목당 한 줄만 낸다 — 2026-09-10 에 만든 자리인데
       * 이 화면이 안 옮겨져 있었다.
       */
      api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
    ])
      .then(([t, w, it, pu]) => {
        setRows(t.data); setWarehouses(w.data)
        setCostById(stockCostMapFromLast(it.data, pu.data))
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  /* 기간이 바뀌면 서버에 다시 묻는다 — 예전에는 전 기간을 받아 브라우저에서 걸렀다. */
  useEffect(() => { load() }, [cond.from, cond.to])

  /* 담당자는 id 만 저장한다(inventory 는 hr 을 참조할 수 없다) — 이름은 코드도움 목록에서 붙인다. */
  const empName = (id: number | null) => pickers.employees.find((e) => e.id === id)?.name ?? ''

  const shown = rows
    .filter((r) => !cond.from || r.transferDate >= cond.from)
    .filter((r) => !cond.to || r.transferDate <= cond.to)
    .filter((r) => !cond.warehouseId
      || String(r.fromWarehouseId) === cond.warehouseId
      || String(r.toWarehouseId) === cond.warehouseId)
    .filter((r) => !cond.project || String(r.projectId) === cond.project)
    .filter((r) => !cond.item || String(r.itemId) === cond.item)
    .filter((r) => !cond.employee || empName(r.employeeId) === cond.employee)
    .filter((r) => !cond.reason || (r.reason ?? '').includes(cond.reason))
    /* [보내는창고]·[받는창고] — 위 [창고]와 달리 한쪽만 본다. */
    .filter((r) => !cond.fromWarehouseId || String(r.fromWarehouseId) === cond.fromWarehouseId)
    .filter((r) => !cond.toWarehouseId || String(r.toWarehouseId) === cond.toWarehouseId)
    .filter((r) => !cond.category || (r.itemCategoryName ?? '') === cond.category)
    .filter((r) => !cond.itemGroup || mgmt.groupOf(r.itemId) === cond.itemGroup)
    .filter((r) => !cond.author || (r.createdBy ?? '') === cond.author)
    .filter((r) => !cond.qtyFrom || r.quantity >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || r.quantity <= Number(cond.qtyTo))
    .filter((r) => !cond.madeFrom || (r.createdAt ?? '').slice(0, 10) >= cond.madeFrom)
    .filter((r) => !cond.madeTo || ((r.createdAt ?? '') !== '' && r.createdAt!.slice(0, 10) <= cond.madeTo))
    .filter((r) => !cond.editedFrom || (r.updatedAt ?? '').slice(0, 10) >= cond.editedFrom)
    .filter((r) => !cond.editedTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= cond.editedTo))
    /* 원본 [기타]의 수정일자순(정렬) — 켜면 마지막에 고친 이동이 위로 온다. */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0))

  /**
   * 원본 [데이터 보기형식] · [그래프로 보기].
   * 창고이동은 <b>어디서 어디로</b> 가 이 화면의 축이다 — 품목으로 묶으면 같은 품목이
   * 어느 창고에서 어느 창고로 갔는지가 사라진다. 보내는창고 → 받는창고 짝으로 묶는다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')
  const chartRows = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of shown) {
      const label = `${r.fromWarehouseName} → ${r.toWarehouseName}`
      m.set(label, (m.get(label) ?? 0) + r.quantity)
    }
    return [...m].map(([label, value]) => ({ label, value }))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows, cond])

  const summary = useMemo(() => {
    const m = new Map<string, { from: string; to: string; itemCode: string; itemName: string; unit: string; qty: number; count: number }>()
    shown.forEach((r) => {
      const k = `${r.fromWarehouseId}:${r.toWarehouseId}:${r.itemId}`
      const g = m.get(k) ?? { from: r.fromWarehouseName, to: r.toWarehouseName, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit, qty: 0, count: 0 }
      g.qty += r.quantity
      g.count += 1
      m.set(k, g)
    })
    return [...m.entries()].map(([k, g]) => ({ k, ...g })).sort((a, b) => b.qty - a.qty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cond])

  /**
   * 원본의 <b>[금액(수량*입고단가)]</b>.
   *
   * <p>이름이 계산식 그대로다 — 전표에 적힌 <b>거래 금액이 아니라</b> 그 품목을
   * <b>얼마에 사 왔는지</b>로 수량을 값으로 환산한 칸이다. 그래서 "창고이동에 단가를
   * 안 매긴다" 는 것은 못 만드는 이유가 되지 않았다(예전에 그렇게 적어 두었다).
   * 평가단가는 재고자산·경영자보고서와 <b>같은 규칙</b>을 쓴다
   * (<code>stockCostMapFromLast</code>: 마지막 입고단가 → 없으면 품목 구매단가).
   *
   * <p>단가를 모르는 품목은 <b>빈칸</b>이다 — 0 으로 채우면 "값이 0원" 으로 읽혀
   * 모르는 것과 구별이 안 된다.
   */
  const amountOf = (itemId: number, qty: number) => {
    const c = costById.get(itemId)
    return c == null ? null : qty * c
  }
  const totalQty = shown.reduce((n, r) => n + r.quantity, 0)
  const totalAmount = shown.reduce((n, r) => n + (amountOf(r.itemId, r.quantity) ?? 0), 0)
  const reset = () => {
    setMode('내역')
    setCond({
      from: init.from, to: init.to, warehouseId: '', project: '', item: '', employee: '', reason: '',
      fromWarehouseId: '', toWarehouseId: '', category: '', itemGroup: '', author: '',
      madeFrom: '', madeTo: '', editedFrom: '', editedTo: '', qtyFrom: '', qtyTo: '',
    })
    setByUpdated(false)
  }

  /*
   * 원본 하단 단추줄의 <b>[선택삭제]</b> — 고른 줄을 한 번에 지운다.
   *
   * <p>하나가 막혀도 <b>거기서 멈추지 않는다</b> — 나머지는 지우고 몇 건이 남았는지 알려 준다.
   * 중간에 끊으면 무엇이 지워졌는지 사람이 알 수 없다.
   */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) { setError('삭제할 창고이동을(를) 고르세요.'); return }
    if (!window.confirm(`고른 ${ids.length}건을 삭제할까요?`)) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/stock-transfers/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 다른 전표가 물고 있을 수 있습니다).` : '')
    load()
  }

  return (
    <EcListShell
      title="창고이동현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        /* 원본 차례: 인쇄 · 선택삭제 · Excel (사본 실측) */
        { label: '인쇄' },
        { label: `선택삭제${picked.size ? ` (${picked.size})` : ''}`, onClick: removeChecked },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        dateLabel="기준일자"
        view={view} onViewChange={setView}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['내역', '집계'] as const).map((m) => (
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
        {/* 원본 차례: 창고 · (창고계층그룹) · 보내는창고 · 받는창고 · 품목 · 품목구분 · 품목그룹1 · 프로젝트 … */}
        <EcCond label="보내는창고" pick>
          <CodePickerField label="보내는창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.fromWarehouseId} onChange={(v) => setC({ fromWarehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="받는창고" pick>
          <CodePickerField label="받는창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.toWarehouseId} onChange={(v) => setC({ toWarehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={150} emptyLabel="전체"
                           value={cond.category} onChange={(v) => setC({ category: v })}
                           items={[...new Set(rows.map((r) => r.itemCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={150} emptyLabel="전체"
                           value={cond.itemGroup} onChange={(v) => setC({ itemGroup: v })}
                           items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setCond((c) => ({ ...c, project: v }))}
                           items={pickers.projects} />
        </EcCond>
        {/* 원본 차례: 프로젝트 · (프로젝트그룹1·2) · 기타 · 담당자 · 적요 … */}
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setCond((c) => ({ ...c, employee: v }))}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={cond.reason}
                 onChange={(e) => setC({ reason: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        {/* 원본 창고이동<b>현황</b> 차례: … 적요 · (오더관리번호) · <b>수량</b> · (진행상태) · 최초작성자 … */}
        <EcCond label="수량">
          <input className="ec-input" type="number" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 110, textAlign: 'right' }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input className="ec-input" type="number" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 110, textAlign: 'right' }} />
        </EcCond>
        {/* 원본 차례: 적요 · (최종수정자 · 발송여부 · 오더관리번호) · 최초작성자 · 최초작성일자 · 최종작업일자 */}
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체"
                           value={cond.author} onChange={(v) => setC({ author: v })}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성일자">
          <input type="date" className="ec-input" value={cond.madeFrom} onChange={(e) => setC({ madeFrom: e.target.value })} style={{ width: 140 }} />
          <span className="my-0 mx-[6px] text-ec-label">~</span>
          <input type="date" className="ec-input" value={cond.madeTo} onChange={(e) => setC({ madeTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="최종작업일자">
          <input type="date" className="ec-input" value={cond.editedFrom} onChange={(e) => setC({ editedFrom: e.target.value })} style={{ width: 140 }} />
          <span className="my-0 mx-[6px] text-ec-label">~</span>
          <input type="date" className="ec-input" value={cond.editedTo} onChange={(e) => setC({ editedTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        {mode === '내역' ? '건수' : '이동경로'}{' '}
        <b className="text-ec-text">{num(mode === '내역' ? shown.length : summary.length)}</b>
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        이동수량 <b className="text-ec-blue text-[14px]">{num(totalQty)}</b>
      </div>

      <div className="overflow-x-auto">
        {view === '그래프' ? (
          <EcBarChart rows={chartRows} unit="" emptyText="조회된 이동 내역이 없습니다." />
        ) : mode === '내역' ? (
          <table className="w-full text-left">
            <colgroup>
              <col className="w-[4%]" /><col className="w-[14%]" /><col className="w-[10%]" />
              <col /><col className="w-[13%]" /><col className="w-[13%]" />
              <col className="w-[10%]" /><col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="w-[28px]"></th>
                <th></th>
                {/*
                  원본 창고이동조회의 열은 <b>일자-No. · 보내는창고명 · 받는창고명 ·
                  품목명[규격명] · 수량</b> 이다(사본 실측). 우리는 다섯 칸이 다 다른
                  이름이었고, 일자와 번호도 둘로 나눠 두었다. 생산불출조회는 이미
                  [보내는창고명]·[받는공장명]을 쓰고 있어 <b>우리끼리도 어긋나</b> 있었다.
                */}
                {/*
                  2026-09-09 원본(E040505) 격자 실측 — 이름 셋이 달랐다.
                  원본은 <b>출고창고명 · 입고창고명 · 품목명[규격]</b> 이다
                  (생산불출현황도 같은 이름을 쓴다 — 폐기현황만 [규격명] 이었다).
                  <b>[금액(수량*입고단가)]은 이제 만든다.</b> 예전에 "창고이동에 단가를 안 매긴다"
                  고 적어 두었는데, 그 칸은 이름이 계산식 그대로다 — 전표의 거래 금액이 아니라
                  <b>그 품목을 얼마에 사 왔는지</b>로 수량을 환산한 값이다. 이동전표에 단가가
                  없다는 것은 이 칸을 못 만드는 이유가 아니었다.
                */}
                <th>일자-No.</th>
                <th>출고창고명</th>
                <th>입고창고명</th>
                <th>품목명[규격]</th>
                <th className="text-right">수량</th>
                <th className="w-[130px] text-right">금액(수량*입고단가)</th>
                <th>적요</th>
                {/* 원본 창고이동조회의 마지막 열 [인쇄] — 그 한 건을 이동증으로 찍는다. */}
                <th className="w-[60px] text-center">인쇄</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center text-ec-ink">불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.id}>
                  <td className="text-center bg-ec-stripe">
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => pick(r.id)} />
                  </td>
                  <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
                  <td>
                    {r.transferDate.replace(/-/g, '/')} {r.transferNo}
                  </td>
                  <td style={{ color: '#a5561b' }}>{r.fromWarehouseName}</td>
                  <td className="text-ec-blue">{r.toWarehouseName}</td>
                  <td>{r.itemName}{r.spec ? `[${r.spec}]` : ''} <span className="text-[11px] text-ec-hint">{r.itemCode}</span></td>
                  <td className="text-right font-bold">
                    {num(r.quantity)} <span className="text-[11px] font-normal text-ec-hint">{r.unit}</span>
                  </td>
                  <td className="text-right text-ec-label">
                    {amountOf(r.itemId, r.quantity) == null ? '' : num(amountOf(r.itemId, r.quantity)!)}
                  </td>
                  <td className="text-ec-label">{r.reason ?? ''}</td>
                  <td className="text-center">
                    <button onClick={() => printTransfer(r)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} className="text-right font-bold bg-ec-page">합계</td>
                  <td className="text-right font-bold bg-ec-page text-ec-blue">{num(totalQty)}</td>
                  <td className="text-right font-bold bg-ec-page">{num(totalAmount)}</td>
                  <td colSpan={2} className="bg-ec-page"></td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col className="w-[5%]" /><col className="w-[16%]" /><col className="w-[16%]" />
              <col className="w-[15%]" /><col />
              <col className="w-[9%]" /><col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>출고창고</th>
                <th>입고창고</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th className="text-right">건수</th>
                <th className="text-right">이동수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center text-ec-ink">불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : summary.map((g, i) => (
                <tr key={g.k}>
                  <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
                  <td style={{ color: '#a5561b' }}>{g.from}</td>
                  <td className="text-ec-blue">{g.to}</td>
                  <td>{g.itemCode}</td>
                  <td>{g.itemName}</td>
                  <td className="text-right text-ec-hint">{num(g.count)}</td>
                  <td className="text-right font-bold">
                    {num(g.qty)} <span className="text-[11px] font-normal text-ec-hint">{g.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} className="text-right font-bold bg-ec-page">합계</td>
                  <td className="text-right font-bold bg-ec-page text-ec-blue">{num(totalQty)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}
