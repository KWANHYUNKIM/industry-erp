import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { ymd, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { usePartnerGroups } from '../../utils/partnerGroups'

/**
 * 데이터센터 › 의료기기공급내역보고 (이카운트 C001403)
 *
 * <p>원본은 공급 내역을 그때그때 계산해 보여 주는 화면이 아니라 <b>보고할 줄을 저장하는</b> 화면이다
 * (2026-10-03 loginaa 실측). [신규]를 누르면 판매검색창이 바로 뜨고, 고른 판매에서 <b>시리얼(UDI)이 달린 줄</b>만
 * 불러와 납품일자 · 중고 여부 · 납품장소가다름여부를 채워 저장한다. 판매 줄 하나는 한 번만 보고한다.
 * 목록은 저장한 줄을 [전송상태]와 함께 보인다.
 *
 * <p>예전 우리 화면은 판매 · 폐기에서 공급 줄을 계산해 보고파일(CSV)을 만들었다 — 원본에 없는 모양이라
 * 열 · 버튼 · 입력이 하나도 안 맞았다(그 API 는 남겨 두었다). [전송(F8)] · [인증정보등록] · [매핑조회] ·
 * [송신이력]은 의료기기 통합시스템 연동이라 만들지 않는다 — 늘 미전송이다.
 */

type SupplyType = 'OUT' | 'RETURN' | 'DISPOSAL' | 'RENTAL' | 'RECALL'
const SUPPLY_TYPES: { value: SupplyType; label: string }[] = [
  { value: 'OUT', label: '출고' }, { value: 'RETURN', label: '반품' }, { value: 'DISPOSAL', label: '폐기' },
  { value: 'RENTAL', label: '임대' }, { value: 'RECALL', label: '회수' },
]
/* 원본 [공급형태코드] — 쉼표까지 원본 표기 그대로(보고 서식의 값이다). */
const SUPPLY_SHAPES = ['제조, 수입, 판매', '의료기관', '약국개설자, 의약품도매상', '견본품, 기부용, 군납용'] as const

interface Row {
  entryId: number; lineId: number; entryDate: string; docNo: string; reportMonth: string
  supplyType: SupplyType; supplyTypeName: string; supplyShape: string
  partnerName: string | null; itemName: string | null; udi: string | null; quantity: number
  transmitted: boolean; transmitStatus: string; transmittedAt: string | null
  deliveryDate: string | null; partnerId: number | null; itemId: number | null; updatedAt: string | null
}
interface Line {
  id?: number | null; salesLineId: number | null; sourceDocNo: string | null; udi: string | null
  deliveryDate: string | null; used: boolean; partnerSystemCode: string | null
  partnerId: number | null; partnerName: string | null; differentPlace: boolean
  itemId: number | null; itemName: string | null; quantity: number; unitPrice: number; amount: number
}
interface Entry {
  id: number; docNo: string; reportMonth: string; supplyType: SupplyType; supplyShape: string; lines: Line[]
}
interface SaleCandidate {
  saleId: number; saleDate: string; docNo: string; partnerName: string | null; itemSummary: string
  totalAmount: number; warehouseName: string | null; accountingReflected: boolean
  confirmStatus: string | null; confirmStatusName: string | null
}

const today = () => ymd(new Date())
/* 원본 기준일자 기본값 [최근 1년] — 2025/10/03 ~ 2026/10/03 (오늘 기준 1년 전 같은 날부터). */
const lastYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return ymd(d) }
const num = (v: number) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
const qty = (v: number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const YEARS = (() => { const y = new Date().getFullYear(); return [y - 2, y - 1, y, y + 1] })()
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

const emptyCond = {
  view: '건별' as '건별' | '전표별',
  from: lastYear(), to: today(),
  useMonth: false, month: today().slice(0, 7),
  types: SUPPLY_TYPES.map((t) => t.value) as SupplyType[],
  shapes: [...SUPPLY_SHAPES] as string[],
  deliveryFrom: '', deliveryTo: '',
  partner: '', partnerGroup: '', item: '', itemCategory: '', itemGroup: '', byUpdated: false,
}

export default function MedicalDeviceReportPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'전체' | '미전송' | '전송'>('전체')
  const [cond, setCond] = useState(emptyCond)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  async function load() {
    setLoading(true); setError('')
    try {
      setRows((await api.get<Row[]>('/medical-device-reports/entries', { params: { from: cond.from, to: cond.to } })).data)
    } catch (err) { setError(extractErrorMessage(err)) } finally { setLoading(false) }
  }
  /* 기간이 바뀔 때만 서버에 다시 묻는다 — 나머지 조건은 받아 둔 줄을 그 자리에서 거른다. */
  useEffect(() => { load() }, [cond.from, cond.to]) // eslint-disable-line react-hooks/exhaustive-deps

  /* 원본 [거래처그룹] · [품목구분] · [품목그룹1] — 보고 줄은 거래처·품목 id 만 들어 마스터에서 읽는다. */
  const { groupOptions, groupOfName } = usePartnerGroups()
  const [itemInfo, setItemInfo] = useState<Map<number, { category: string | null; group: string | null }>>(new Map())
  useEffect(() => {
    api.get<{ id: number; categoryName: string | null; itemGroupName: string | null }[]>('/items')
      .then((r) => setItemInfo(new Map(r.data.map((i) => [i.id, { category: i.categoryName, group: i.itemGroupName }]))))
      .catch(() => setItemInfo(new Map()))
  }, [])

  const shown = useMemo(() => {
    const r = rows
      .filter((x) => tab === '전체' || x.transmitStatus === tab)
      .filter((x) => !cond.useMonth || x.reportMonth === cond.month)
      .filter((x) => cond.types.includes(x.supplyType))
      .filter((x) => cond.shapes.includes(x.supplyShape))
      .filter((x) => !cond.deliveryFrom || (x.deliveryDate ?? '') >= cond.deliveryFrom)
      .filter((x) => !cond.deliveryTo || (x.deliveryDate ?? '') <= cond.deliveryTo)
      .filter((x) => !cond.partner || x.partnerName === cond.partner)
      .filter((x) => !cond.partnerGroup || groupOfName(x.partnerName) === cond.partnerGroup)
      .filter((x) => !cond.item || x.itemName === cond.item)
      .filter((x) => !cond.itemCategory || (x.itemId != null && itemInfo.get(x.itemId)?.category === cond.itemCategory))
      .filter((x) => !cond.itemGroup || (x.itemId != null && itemInfo.get(x.itemId)?.group === cond.itemGroup))
    return cond.byUpdated ? [...r].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')) : r
  }, [rows, tab, cond, groupOfName, itemInfo])

  /* [조회구분] 전표별 — 한 장을 한 줄로. 품목·UDI 는 첫 줄 것에 '외 n건'. */
  const view = useMemo(() => {
    if (cond.view === '건별') return shown
    const m = new Map<number, Row & { more: number }>()
    for (const r of shown) {
      const cur = m.get(r.entryId)
      if (cur) { cur.more += 1; cur.quantity = Number(cur.quantity) + Number(r.quantity) }
      else m.set(r.entryId, { ...r, more: 0 })
    }
    return [...m.values()].map((r) => ({ ...r, itemName: r.more ? `${r.itemName ?? ''} 외 ${r.more}건` : r.itemName }))
  }, [shown, cond.view])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '의료기기공급내역보고', [view.length, cond.view])

  const partnerItems = useMemo(() => [...new Set(rows.map((r) => r.partnerName).filter((v): v is string => !!v))]
    .map((n) => ({ value: n, name: n })), [rows])
  const itemItems = useMemo(() => [...new Set(rows.map((r) => r.itemName).filter((v): v is string => !!v))]
    .map((n) => ({ value: n, name: n })), [rows])

  const setC = <K extends keyof typeof emptyCond>(k: K, v: (typeof emptyCond)[K]) => setCond((c) => ({ ...c, [k]: v }))
  const toggleIn = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v))

  /* ── 입력 · 수정 창 ─────────────────────────────────────────── */
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [head, setHead] = useState({ year: today().slice(0, 4), month: today().slice(5, 7), supplyType: 'OUT' as SupplyType, supplyShape: SUPPLY_SHAPES[0] as string })
  const [lines, setLines] = useState<Line[]>([])
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditId(null); setFormError(''); setLines([])
    setHead({ year: today().slice(0, 4), month: today().slice(5, 7), supplyType: 'OUT', supplyShape: SUPPLY_SHAPES[0] })
    setOpen(true); openSales()
  }
  async function openEdit(entryId: number) {
    setFormError('')
    try {
      const e = (await api.get<Entry>(`/medical-device-reports/entries/${entryId}`)).data
      setEditId(e.id)
      setHead({ year: e.reportMonth.slice(0, 4), month: e.reportMonth.slice(5, 7), supplyType: e.supplyType, supplyShape: e.supplyShape })
      setLines(e.lines)
      setOpen(true)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => {
    if (k !== i) return l
    const n = { ...l, ...patch }
    if ('quantity' in patch || 'unitPrice' in patch) n.amount = Number(n.quantity) * Number(n.unitPrice)
    return n
  }))

  async function save() {
    if (saving || lines.length === 0) return
    setSaving(true); setFormError('')
    const body = { reportMonth: `${head.year}-${head.month}`, supplyType: head.supplyType, supplyShape: head.supplyShape, lines }
    try {
      if (editId) await api.put(`/medical-device-reports/entries/${editId}`, body)
      else await api.post('/medical-device-reports/entries', body)
      setOpen(false); load()
    } catch (err) { setFormError(extractErrorMessage(err)) } finally { setSaving(false) }
  }

  async function removeOne() {
    if (!editId || !window.confirm('삭제하겠습니까?')) return
    try { await api.delete(`/medical-device-reports/entries/${editId}`); setOpen(false); load() }
    catch (err) { setFormError(extractErrorMessage(err)) }
  }

  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0 || !window.confirm('삭제하겠습니까?')) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/medical-device-reports/entries/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다.` : '')
    load()
  }

  /* ── 판매검색창 ──────────────────────────────────────────────── */
  const initSales = periodOf('최근30일(+1개월)')!
  const [salesOpen, setSalesOpen] = useState(false)
  const [sales, setSales] = useState<SaleCandidate[]>([])
  const [salesTab, setSalesTab] = useState<'전체' | '결재중' | '미확인' | '확인'>('전체')
  const [salesPicked, setSalesPicked] = useState<Set<number>>(new Set())
  const [salesError, setSalesError] = useState('')

  async function openSales() {
    setSalesPicked(new Set()); setSalesError(''); setSalesOpen(true)
    try { setSales((await api.get<SaleCandidate[]>('/medical-device-reports/entries/sales', { params: { from: initSales.from, to: initSales.to } })).data) }
    catch (err) { setSalesError(extractErrorMessage(err)) }
  }
  async function applySales() {
    setSalesError('')
    try {
      const pulled = (await api.post<Line[]>('/medical-device-reports/entries/pull', [...salesPicked],
        { params: { exceptEntryId: editId ?? undefined } })).data
      const have = new Set(lines.map((l) => l.salesLineId).filter(Boolean))
      const fresh = pulled.filter((l) => !have.has(l.salesLineId))
      if (fresh.length === 0) {
        setSalesError('시리얼(UDI)이 등록된 모든 내역이 저장되었거나 불러올 내역이 없습니다. 확인 후 다시 시도 바랍니다.')
        return
      }
      setLines((ls) => [...ls, ...fresh])
      setSalesOpen(false)
    } catch (err) { setSalesError(extractErrorMessage(err)) }
  }
  useShortcut('F8', save, open && !salesOpen)
  const salesShown = sales.filter((s) => salesTab === '전체' || s.confirmStatusName === salesTab)

  const total = lines.reduce((a, l) => ({ q: a.q + Number(l.quantity), m: a.m + Number(l.amount) }), { q: 0, m: 0 })

  return (
    <EcListShell title="의료기기공급내역보고" collapseConditions onNew={openNew} onSearch={load}
                 actions={[{ label: '선택삭제', onClick: removeChecked, disabled: picked.size === 0 }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="조회구분">
          {(['건별', '전표별'] as const).map((k) => (
            <label key={k} className="flex items-center gap-[3px] mr-[10px]">
              <input type="radio" checked={cond.view === k} onChange={() => setC('view', k)} />{k}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자" span={2}>
          <input type="date" className="ec-input" value={cond.from} onChange={(e) => setC('from', e.target.value)} /> ~
          <input type="date" className="ec-input" value={cond.to} onChange={(e) => setC('to', e.target.value)} />
        </EcCond>
        <EcCond label="보고기준월">
          <input type="month" className="ec-input" value={cond.month} disabled={!cond.useMonth} onChange={(e) => setC('month', e.target.value)} />
          <label className="flex items-center gap-[3px]"><input type="checkbox" checked={cond.useMonth} onChange={(e) => setC('useMonth', e.target.checked)} /> 사용</label>
        </EcCond>
        <EcCond label="공급구분" span="full">
          <label className="flex items-center gap-[3px] mr-[10px]">
            <input type="checkbox" checked={cond.types.length === SUPPLY_TYPES.length}
                   onChange={(e) => setC('types', e.target.checked ? SUPPLY_TYPES.map((t) => t.value) : [])} />전체
          </label>
          {SUPPLY_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-[3px] mr-[10px]">
              <input type="checkbox" checked={cond.types.includes(t.value)} onChange={(e) => setC('types', toggleIn(cond.types, t.value, e.target.checked))} />{t.label}
            </label>
          ))}
        </EcCond>
        <EcCond label="공급형태" span="full">
          <label className="flex items-center gap-[3px] mr-[10px]">
            <input type="checkbox" checked={cond.shapes.length === SUPPLY_SHAPES.length}
                   onChange={(e) => setC('shapes', e.target.checked ? [...SUPPLY_SHAPES] : [])} />전체
          </label>
          {SUPPLY_SHAPES.map((k) => (
            <label key={k} className="flex items-center gap-[3px] mr-[10px]">
              <input type="checkbox" checked={cond.shapes.includes(k)} onChange={(e) => setC('shapes', toggleIn(cond.shapes, k, e.target.checked))} />{k}
            </label>
          ))}
        </EcCond>
        <EcCond label="납품일자" span={2}>
          <input type="date" className="ec-input" value={cond.deliveryFrom} onChange={(e) => setC('deliveryFrom', e.target.value)} /> ~
          <input type="date" className="ec-input" value={cond.deliveryTo} onChange={(e) => setC('deliveryTo', e.target.value)} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={cond.partner} onChange={(v) => setC('partner', v)} items={partnerItems} />
        </EcCond>
        <EcCond label="거래처그룹">
          <select className="ec-input w-[150px]" value={cond.partnerGroup} onChange={(e) => setC('partnerGroup', e.target.value)}>
            <option value="">전체</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} value={cond.item} onChange={(v) => setC('item', v)} items={itemItems} />
        </EcCond>
        <EcCond label="품목구분">
          <select className="ec-input w-[150px]" value={cond.itemCategory} onChange={(e) => setC('itemCategory', e.target.value)}>
            <option value="">전체</option>
            {[...new Set([...itemInfo.values()].map((i) => i.category).filter((v): v is string => !!v))].sort()
              .map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input w-[150px]" value={cond.itemGroup} onChange={(e) => setC('itemGroup', e.target.value)}>
            <option value="">전체</option>
            {[...new Set([...itemInfo.values()].map((i) => i.group).filter((v): v is string => !!v))].sort()
              .map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="기타">
          <label className="flex items-center gap-[3px]"><input type="checkbox" checked={cond.byUpdated} onChange={(e) => setC('byUpdated', e.target.checked)} /> 수정일자순(정렬)</label>
        </EcCond>
      </ul>

      <div className="flex items-center justify-between mb-[6px]">
        <div className="ec-pills">
          {(['전체', '미전송', '전송'] as const).map((t) => (
            <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <span className="text-ec-label">{dateText(cond.from)} ~ {dateText(cond.to)}</span>
      </div>

      <table ref={tableRef} className="w-full ec-head700">
        <thead><tr>
          <th className="w-[40px] text-center">
            <input type="checkbox" checked={view.length > 0 && view.every((r) => picked.has(r.entryId))} disabled={view.length === 0}
                   onChange={(e) => setPicked(e.target.checked ? new Set(view.map((r) => r.entryId)) : new Set())} />
          </th>
          <th className="w-[130px]">전표일자-No.</th>
          <th className="w-[80px] text-center">보고기준월</th>
          <th className="w-[70px]">공급구분</th>
          <th className="w-[160px]">공급형태</th>
          <th>거래처명</th>
          <th>품목명</th>
          <th className="w-[200px]">표준코드(UDI)</th>
          <th className="w-[80px] text-right">수량</th>
          <th className="w-[70px]">전송상태</th>
          <th className="w-[130px]">전송일시</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : view.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : view.map((r) => (
            <tr key={cond.view === '건별' ? r.lineId : r.entryId}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(r.entryId)} onChange={(e) => setPicked((s) => {
                  const n = new Set(s); if (e.target.checked) n.add(r.entryId); else n.delete(r.entryId); return n
                })} />
              </td>
              <td><a className="ec-link cursor-pointer" onClick={() => openEdit(r.entryId)}>{r.docNo}</a></td>
              <td className="text-center">{r.reportMonth.replace('-', '/')}</td>
              <td>{r.supplyTypeName}</td>
              <td>{r.supplyShape}</td>
              <td>{r.partnerName}</td>
              <td>{r.itemName}</td>
              <td>{r.udi}</td>
              <td className="text-right">{qty(r.quantity)}</td>
              <td>{r.transmitStatus}</td>
              <td>{r.transmittedAt ? dateText(r.transmittedAt.slice(0, 10)) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} width={1030} error={formError} onClose={() => setOpen(false)}
             title={editId ? '의료기기공급내역보고수정' : '의료기기공급내역보고입력'}>
        <ul className="ec-form grid-cols-1">
          <li>
            <div className="title">보고기준월</div>
            <div className="form">
              <select className="ec-input w-[80px]" value={head.year} onChange={(e) => setHead({ ...head, year: e.target.value })}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="ec-input w-[64px]" value={head.month} onChange={(e) => setHead({ ...head, month: e.target.value })}>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </li>
          <li>
            <div className="title">공급구분코드</div>
            <div className="form">
              {SUPPLY_TYPES.map((t) => (
                <label key={t.value} className="flex items-center gap-[3px] mr-[10px]">
                  <input type="radio" checked={head.supplyType === t.value} onChange={() => setHead({ ...head, supplyType: t.value })} />{t.label}
                </label>
              ))}
            </div>
          </li>
          <li>
            <div className="title">공급형태코드</div>
            <div className="form flex-wrap">
              {SUPPLY_SHAPES.map((k) => (
                <label key={k} className="flex items-center gap-[3px] mr-[10px]">
                  <input type="radio" checked={head.supplyShape === k} onChange={() => setHead({ ...head, supplyShape: k })} />{k}
                </label>
              ))}
            </div>
          </li>
        </ul>

        <div className="flex gap-[4px] my-[8px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={openSales}>판매</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full ec-head700">
            <thead><tr>
              <th className="w-[34px]"></th>
              <th>불러온 전표</th>
              <th className="w-[110px]">불러온 전표일자-No.</th>
              <th className="w-[170px]">표준코드(UDI)</th>
              <th className="w-[130px]">납품일자</th>
              <th className="w-[110px]">중고 의료기기 여부</th>
              <th className="w-[110px]">통합시스템거래처코드</th>
              <th>거래처명</th>
              <th className="w-[110px]">납품장소가다름여부</th>
              <th>품목명</th>
              <th className="w-[80px] text-right">수량</th>
              <th className="w-[90px] text-right">단가</th>
              <th className="w-[100px] text-right">금액</th>
            </tr></thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={13} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : lines.map((l, i) => (
                <tr key={l.salesLineId ?? `n${i}`}>
                  <td className="text-center">
                    <button type="button" className="ec-link" title="줄 지우기" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>×</button>
                  </td>
                  <td>{l.salesLineId ? '판매' : ''}</td>
                  <td>{l.sourceDocNo}</td>
                  <td>{l.udi}</td>
                  <td><input type="date" className="ec-input w-full" value={l.deliveryDate ?? ''} onChange={(e) => setLine(i, { deliveryDate: e.target.value || null })} /></td>
                  <td>
                    {([true, false] as const).map((v) => (
                      <label key={String(v)} className="inline-flex items-center gap-[2px] mr-[6px]">
                        <input type="radio" checked={l.used === v} onChange={() => setLine(i, { used: v })} />{v ? 'Yes' : 'No'}
                      </label>
                    ))}
                  </td>
                  <td><input className="ec-input w-full" value={l.partnerSystemCode ?? ''} onChange={(e) => setLine(i, { partnerSystemCode: e.target.value })} /></td>
                  <td>{l.partnerName}</td>
                  <td>
                    {([true, false] as const).map((v) => (
                      <label key={String(v)} className="inline-flex items-center gap-[2px] mr-[6px]">
                        <input type="radio" checked={l.differentPlace === v} onChange={() => setLine(i, { differentPlace: v })} />{v ? 'Yes' : 'No'}
                      </label>
                    ))}
                  </td>
                  <td>{l.itemName}</td>
                  <td><input className="ec-input w-full text-right" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })} /></td>
                  <td><input className="ec-input w-full text-right" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) || 0 })} /></td>
                  <td className="text-right">{num(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={10}></td>
              <td className="text-right">{qty(total.q)}</td>
              <td></td>
              <td className="text-right">{num(total.m)}</td>
            </tr></tfoot>
          </table>
        </div>

        <div className="flex gap-[4px] mt-[9px]">
          {lines.length > 0 && <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>}
          {editId
            ? <button className="ec-btn" onClick={removeOne}>삭제</button>
            : <button className="ec-btn" onClick={() => setLines([])}>다시 작성</button>}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={salesOpen} width={900} title="판매검색창(조회)" error={salesError} onClose={() => setSalesOpen(false)}>
        <div className="flex items-center justify-between mb-[6px]">
          <div className="ec-pills">
            {(['전체', '결재중', '미확인', '확인'] as const).map((t) => (
              <button key={t} type="button" className={`ec-pill no-ec${salesTab === t ? ' active' : ''}`} onClick={() => setSalesTab(t)}>{t}</button>
            ))}
          </div>
          <span className="text-ec-label">{dateText(initSales.from)} ~ {dateText(initSales.to)}</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full ec-head700">
            <thead><tr>
              <th className="w-[34px]"></th>
              <th className="w-[120px]">일자-No.</th>
              <th>거래처명</th>
              <th>품목명(요약)</th>
              <th className="w-[110px] text-right">금액합계</th>
              <th className="w-[100px]">창고명</th>
              <th className="w-[90px]">회계반영여부</th>
            </tr></thead>
            <tbody>
              {salesShown.length === 0 ? (
                <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : salesShown.map((s) => (
                <tr key={s.saleId}>
                  <td className="text-center">
                    <input type="checkbox" checked={salesPicked.has(s.saleId)} onChange={(e) => setSalesPicked((p) => {
                      const n = new Set(p); if (e.target.checked) n.add(s.saleId); else n.delete(s.saleId); return n
                    })} />
                  </td>
                  <td>{dateText(s.saleDate)} -{s.docNo.replace(/.*?(\d+)$/, (_, d: string) => String(Number(d.slice(-4))))}</td>
                  <td>{s.partnerName}</td>
                  <td>{s.itemSummary}</td>
                  <td className="text-right">{num(s.totalAmount)}</td>
                  <td>{s.warehouseName}</td>
                  <td>{s.accountingReflected ? '반영' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={applySales} disabled={salesPicked.size === 0}>적용(F8)</button>
          <button className="ec-btn" onClick={() => setSalesOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
