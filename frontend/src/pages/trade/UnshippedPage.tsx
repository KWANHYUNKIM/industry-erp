import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'

/**
 * 영업관리 > 미출하현황 (이카운트 E040228).
 *
 * <p><b>2026-10-20 출하지시서 잔량으로 옮겼다</b>(plans/재고1/E040221.md 1장). 원본의 미출하는
 * '주문 대비 안 나간 수량' 이 아니라 <b>출하지시서 줄 수량 − 그 줄에 이어진 출하 수량</b>이다 —
 * 주문 7 → 출하지시서 4 → 수정 5 → 미출하 5.00 → 출하 3 → 미출하 2.00(원본 실측).
 * 그래서 백엔드 /shipment-orders/unshipped(진행중 지시서의 잔량 있는 줄)를 본다.
 * 예전 줄 끝의 [출하지시](주문 줄에서 바로 출하를 만들던 우리 단추)는 원본에 없어 뺐다 —
 * 지시서는 출하지시서입력에서, 출하는 출하입력에서 낸다.
 *
 * <p>원본 결과 열: 일자-No. · 품목명(규격) · 수량 · 미출하수량 · 창고명 · 거래처명 · 적요 · 출하예정일.
 * 원본 [구분] 은 품목별 · 라인별 둘이다.
 */
/** 원본 [정렬기준] 의 후보. 표 머리로 정렬할 수 있는 열과 같은 것들이어야 한다. */
const SORTS = ['없음', '일자-No.', '품목명(규격)', '거래처명', '출하예정일'] as const

type Mode = '품목별' | '라인별'
const MODES = ['품목별', '라인별'] as const

interface UnshippedLine {
  shipmentOrderId: number
  orderNo: string
  orderDate: string
  lineId: number
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  unit: string
  quantity: number
  unshippedQty: number
  warehouseId: number | null
  warehouseName: string | null
  partnerId: number
  partnerName: string
  projectId: number | null
  employeeName: string | null
  contact: string | null
  address: string | null
  createdBy: string | null
  /** 지시서 진행상태 — 미출하에는 진행중 지시서만 온다. */
  statusName: string
  dueDate: string | null
  remark: string | null
}

const nameSpec = (r: { itemName: string; spec: string | null }) => r.itemName + (r.spec ? ` [${r.spec}]` : '')
const qty = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const EMPTY = { from: '', to: '', partner: '', item: '', shipNo: '',
  dueFrom: '', dueTo: '', warehouse: '', project: '', employee: '', partnerMgr: '', qtyFrom: '', qtyTo: '',
  ordQtyFrom: '', ordQtyTo: '', spec: '', remark: '', author: '', contact: '', address: '', status: '전체' }

export default function UnshippedPage() {
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects', 'employees'])
  const [rows, setRows] = useState<UnshippedLine[]>([])
  const [keyword, setKeyword] = useState('')
  const [cond, setCond] = useState(EMPTY)
  const [partnerMgrs, setPartnerMgrs] = useState<Map<string, string>>(new Map())
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<UnshippedLine[]>('/shipment-orders/unshipped', { params: { from: cond.from || undefined, to: cond.to || undefined } })
      setRows(res.data.map((r) => ({ ...r, quantity: Number(r.quantity), unshippedQty: Number(r.unshippedQty) })))
    } catch (err) {
      setError(extractErrorMessage(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [cond.from, cond.to])

  /* [거래처관리담당자]는 거래처 마스터가 든다 — 미출하 줄은 거래처 이름만 들고 온다. */
  useEffect(() => {
    api.get<{ name: string; manager: string | null }[]>('/partners')
      .then((r) => setPartnerMgrs(new Map(r.data.map((p) => [p.name, p.manager ?? '']))))
      .catch(() => {})
  }, [])

  /** 원본 [관리항목] — 품목 마스터에 붙는 값이라 줄의 itemId 로 잇는다. */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')

  const shownRows = rows.filter(
    (r) => !keyword || r.partnerName.includes(keyword) || r.orderNo.includes(keyword) || r.itemName.includes(keyword),
  )
    /* 기준일자는 지시서 일자, 출하예정일은 지시서의 출하예정일이다. */
    .filter((r) => !cond.from || r.orderDate >= cond.from)
    .filter((r) => !cond.to || r.orderDate <= cond.to)
    .filter((r) => !cond.dueFrom || (r.dueDate ?? '') >= cond.dueFrom)
    .filter((r) => !cond.dueTo || (r.dueDate ?? '') <= cond.dueTo)
    .filter((r) => !cond.warehouse || String(r.warehouseId) === cond.warehouse)
    .filter((r) => !cond.project || String(r.projectId) === cond.project)
    .filter((r) => !cond.employee || (r.employeeName ?? '') === cond.employee)
    .filter((r) => !cond.partnerMgr || partnerMgrs.get(r.partnerName) === cond.partnerMgr)
    .filter((r) => !cond.partner || String(r.partnerId) === cond.partner)
    .filter((r) => !cond.item || String(r.itemId) === cond.item)
    .filter((r) => !mgmtCond || mgmt.nameOf(r.itemId) === mgmtCond)
    .filter((r) => !cond.ordQtyFrom || r.quantity >= Number(cond.ordQtyFrom))
    .filter((r) => !cond.ordQtyTo || r.quantity <= Number(cond.ordQtyTo))
    .filter((r) => !cond.spec || (r.spec ?? '').includes(cond.spec))
    .filter((r) => !cond.remark || (r.remark ?? '').includes(cond.remark))
    .filter((r) => !cond.author || (r.createdBy ?? '') === cond.author)
    .filter((r) => !cond.contact || (r.contact ?? '').includes(cond.contact))
    .filter((r) => !cond.address || (r.address ?? '').includes(cond.address))
    .filter((r) => cond.status === '전체' || r.statusName === cond.status)
    // 원본 [출하지시No.] — 화면에 찍히는 '2026/10/20 -3' 이나 전표번호 일부 어느 쪽이든.
    .filter((r) => !cond.shipNo || r.orderNo.includes(cond.shipNo) || dateNo(r.orderDate, r.orderNo).includes(cond.shipNo))
    .filter((r) => !cond.qtyFrom || r.unshippedQty >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || r.unshippedQty <= Number(cond.qtyTo))

  const sort = useTableSort(shownRows, {
    '일자-No.': (r) => `${r.orderDate} ${r.orderNo}`,
    '품목명(규격)': (r) => nameSpec(r),
    거래처명: (r) => r.partnerName,
    출하예정일: (r) => r.dueDate,
  })
  const shown = sort.sorted
  const [mode, setMode] = useState<Mode>('라인별')
  const [view, setView] = useState<'표' | '그래프'>('표')

  /** 품목별 — 지시서를 가로질러 같은 품목을 모은다. */
  const byItem = useMemo(() => {
    const m = new Map<number, {
      itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
      quantity: number; unshippedQty: number
    }>()
    for (const r of shown) {
      const cur = m.get(r.itemId)
      if (!cur) {
        m.set(r.itemId, {
          itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, spec: r.spec, unit: r.unit,
          quantity: r.quantity, unshippedQty: r.unshippedQty,
        })
      } else {
        cur.quantity += r.quantity
        cur.unshippedQty += r.unshippedQty
      }
    }
    return [...m.values()].sort((a, b) => b.unshippedQty - a.unshippedQty)
  }, [shown])

  const totalQty = useMemo(() => shown.reduce((s, r) => s + r.quantity, 0), [shown])
  const totalUnshipped = useMemo(() => shown.reduce((s, r) => s + r.unshippedQty, 0), [shown])

  /** 라인별 격자 — 달마다 'YYYY/MM 계' 줄을 끼운다(영업관리현황 화면들과 같은 꼴). */
  const byMonth = useMemo(() => {
    const out: { month: string; rows: UnshippedLine[]; quantity: number; unshippedQty: number }[] = []
    for (const r of shown) {
      const month = r.orderDate.slice(0, 7).replace('-', '/')
      let g = out[out.length - 1]
      if (!g || g.month !== month) { g = { month, rows: [], quantity: 0, unshippedQty: 0 }; out.push(g) }
      g.rows.push(r); g.quantity += r.quantity; g.unshippedQty += r.unshippedQty
    }
    return out
  }, [shown])

  const chartRows = useMemo(() =>
    mode === '품목별'
      ? byItem.map((r) => ({ label: nameSpec(r), value: r.unshippedQty }))
      : shown.map((r) => ({ label: nameSpec(r), value: r.unshippedQty })),
    [mode, byItem, shown])

  const reset = () => {
    setCond(EMPTY)
    setMgmtCond('')
    setKeyword('')
  }

  return (
    <EcListShell
      title="미출하현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={undefined}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel(화면)' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        dateLabel="기준일자(영업주기)"
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
      >
        <EcCond label="출하지시No.">
          <input className="ec-input" placeholder="출하지시No. 일부" value={cond.shipNo}
                 onChange={(e) => setC({ shipNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="출하예정일">
          <input type="date" className="ec-input" value={cond.dueFrom}
                 onChange={(e) => setC({ dueFrom: e.target.value })} style={{ width: 140 }} />
          <span className="text-ec-label">~</span>
          <input type="date" className="ec-input" value={cond.dueTo}
                 onChange={(e) => setC({ dueTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={cond.warehouse} onChange={(v) => setC({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setC({ employee: v })}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={cond.partnerMgr} onChange={(v) => setC({ partnerMgr: v })}
                           items={[...new Set(partnerMgrs.values())].filter(Boolean).sort()
                             .map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="미출하수량">
          <input className="ec-input" type="number" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 100 }} />
          <span className="text-ec-label">~</span>
          <input className="ec-input" type="number" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 100 }} />
        </EcCond>
        {/* 원본 차례: 미출하수량 · 오더관리번호 · 연락처 · 주소 · 적요 · 수량 · 규격 · 진행상태 · 작성자. 연락처 · 주소는 지시서가 든다. */}
        <EcCond label="연락처">
          <input className="ec-input" value={cond.contact}
                 onChange={(e) => setC({ contact: e.target.value })} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="주소">
          <input className="ec-input" value={cond.address}
                 onChange={(e) => setC({ address: e.target.value })} style={{ width: 240 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={cond.remark}
                 onChange={(e) => setC({ remark: e.target.value })} style={{ width: 200 }} />
        </EcCond>
        {/* 원본 [수량] — 미출하가 아니라 지시서 줄 수량이다. */}
        <EcCond label="수량">
          <input className="ec-input" type="number" value={cond.ordQtyFrom}
                 onChange={(e) => setC({ ordQtyFrom: e.target.value })} style={{ width: 100 }} />
          <span className="text-ec-label">~</span>
          <input className="ec-input" type="number" value={cond.ordQtyTo}
                 onChange={(e) => setC({ ordQtyTo: e.target.value })} style={{ width: 100 }} />
        </EcCond>
        <EcCond label="규격">
          <ItemSuggestInput field="spec" value={cond.spec}
                            onChange={(v) => setC({ spec: v })} width={140} />
        </EcCond>
        <EcCond label="진행상태">
          <div className="ec-pills">
            {['전체', ...new Set(rows.map((r) => r.statusName))].map((k) => (
              <button key={k} type="button"
                      className={'ec-pill no-ec' + (cond.status === k ? ' active' : '')}
                      onClick={() => setC({ status: k })}>{k}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel width={140} emptyLabel="전체"
                           value={cond.author} onChange={(v) => setC({ author: v })}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="정렬기준">
          <div className="ec-pills">
            {SORTS.map((k) => (
              <button key={k} type="button"
                      className={`ec-pill no-ec${(sort.sortKey ?? '없음') === k ? ' active' : ''}`}
                      onClick={() => sort.setSort(k === '없음' ? null : k)}>{k}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="미출하 잔량이 없습니다." />
      ) : mode === '품목별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[130px]">품목코드</th>
              <th>품목명(규격)</th>
              <th className="w-[110px] text-right">수량</th>
              <th className="w-[110px] text-right">미출하수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="ec-empty">불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g) => (
              <tr key={g.itemId}>
                <td>{g.itemCode}</td>
                <td>{nameSpec(g)}</td>
                <td className="text-right">{qty(g.quantity)}</td>
                <td className="text-right">{qty(g.unshippedQty)}</td>
              </tr>
            ))}
          </tbody>
          {byItem.length > 0 && (
            <tfoot>
              <tr className="ec-list-total">
                <td colSpan={2} className="text-center font-bold">총합계</td>
                <td className="text-right font-bold">{qty(totalQty)}</td>
                <td className="text-right font-bold">{qty(totalUnshipped)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[170px] cursor-pointer" onClick={() => sort.toggle('일자-No.')}>일자-No. {sort.mark('일자-No.')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('품목명(규격)')}>품목명(규격) {sort.mark('품목명(규격)')}</th>
            <th className="w-[90px] text-right">수량</th>
            <th className="w-[90px] text-right">미출하수량</th>
            <th className="w-[110px]">창고명</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('거래처명')}>거래처명 {sort.mark('거래처명')}</th>
            <th className="w-[150px]">적요</th>
            {/* 원본은 [출하예정일]을 가운데로 찍는다(2026-09-09 실측). */}
            <th className="w-[100px] text-center cursor-pointer" onClick={() => sort.toggle('출하예정일')}>출하예정일 {sort.mark('출하예정일')}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : byMonth.flatMap((g) => [
            ...g.rows.map((r) => (
              <tr key={r.lineId}>
                <td>{dateNo(r.orderDate, r.orderNo)}</td>
                <td>{nameSpec(r)}</td>
                <td className="text-right">{qty(r.quantity)}</td>
                <td className="text-right">{qty(r.unshippedQty)}</td>
                <td>{r.warehouseName ?? ''}</td>
                <td>{r.partnerName}</td>
                <td>{r.remark ?? ''}</td>
                <td className="text-center">{r.dueDate ? r.dueDate.replace(/-/g, '/') : ''}</td>
              </tr>
            )),
            <tr key={`m-${g.month}`} className="ec-list-total">
              <td colSpan={2} className="text-center font-bold">{g.month} 계</td>
              <td className="text-right font-bold">{qty(g.quantity)}</td>
              <td className="text-right font-bold">{qty(g.unshippedQty)}</td>
              <td colSpan={4}></td>
            </tr>,
          ])}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr className="ec-list-total">
              <td colSpan={2} className="text-center font-bold">총합계</td>
              <td className="text-right font-bold">{qty(totalQty)}</td>
              <td className="text-right font-bold">{qty(totalUnshipped)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        )}
      </table>
      )}
    </EcListShell>
  )
}
