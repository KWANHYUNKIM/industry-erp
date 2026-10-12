import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import { EcCond } from '../../../components/EcStatusPanel'
import { periodOf, ymd } from '../../../utils/periods'
import { useCondPickers } from '../../../utils/useCondPickers'
import type { Item, StockRow, Warehouse } from '../../../types/api'

/**
 * 원본 <b>간편재고조정</b> 창 — 재고조정조회 · 재고실사조회 · 재고조정진행단계의 [간편재고조정] (2026-10-13 loginaa 실측).
 *
 * <p>첫 창: 조건 [기준일자(하루) · 창고 · 품목코드 · 기타] → 표 [품목코드 · 품목명 · 규격 · 합계 · 창고마다 한 열(창고코드 순)],
 * 단추줄 [조정 · 품목등록 · 창고등록 · 닫기]. 고른 줄 없이 [조정]을 누르면
 * '리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'
 *
 * <p>[조정] 창: 머리 [일자(기준일자, 고칠 수 없음) · 담당자], 줄마다 [품목코드 · 품목명 · 규격 · 창고마다 실사수량 칸(그 날 재고가 미리 들어 있다)],
 * [저장(F8) · 닫기]. 저장하면 바뀐 칸마다 재고조정(간편) 한 장과 실사 한 장이 생기고
 * '요청된 [간편재고조정] 작업이 완료되었습니다.' (실측: 포장김치 본사창고 348 → 350, 재고조정조회 '간편 · 26/10/13-1 · -2').
 *
 * <p>기준일자는 열면 <b>전월 말일</b>이다(10/13 에 열어 2026/09/30, [전월]을 눌러도 같은 날) — 빠른선택은 그 기간의 끝날을 고른다.
 * [기타] 다섯 중 [대표품목환산수량합계](기본 켜짐)는 아직 없다 — 대표품목으로 묶어 세는 표를 따로 재지 않았다.
 */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const
const qty = (n: number) => (n ? n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')

export default function SimpleAdjustDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const navigate = useNavigate()
  const pickers = useCondPickers(['items', 'employees'])
  const [date, setDate] = useState(() => periodOf('전월')!.to)
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [inclUntracked, setInclUntracked] = useState(false)
  const [inclZeroWh, setInclZeroWh] = useState(true)
  const [inclZeroItem, setInclZeroItem] = useState(false)
  const [inclInactive, setInclInactive] = useState(true)
  const [stock, setStock] = useState<StockRow[] | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /* [조정] 창 — 고른 품목, 담당자, 칸마다 넣은 실사수량(키 'itemId:warehouseId'). */
  const [entry, setEntry] = useState<number[] | null>(null)
  const [employee, setEmployee] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => setItems([]))
    api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => setWarehouses([]))
  }, [open])

  async function search(d = date) {
    setError(''); setNotice('')
    try {
      setStock((await api.get<StockRow[]>('/stock', { params: { asOf: d } })).data)
      setPicked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const qtyOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stock ?? []) m.set(`${s.itemId}:${s.warehouseId}`, (m.get(`${s.itemId}:${s.warehouseId}`) ?? 0) + Number(s.quantity))
    return m
  }, [stock])
  /* 창고 열 — 창고코드 순(원본 열 id 가 100 · 400 · 600 …). [재고수량0창고포함]이 꺼지면 재고가 있는 창고만. */
  const columns = useMemo(() => {
    if (!stock) return []
    return warehouses
      .filter((w) => w.active !== false)
      .filter((w) => !warehouse || String(w.id) === warehouse)
      .filter((w) => inclZeroWh || stock.some((s) => s.warehouseId === w.id && Number(s.quantity) !== 0))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [stock, warehouses, warehouse, inclZeroWh])
  const rows = useMemo(() => {
    if (!stock) return []
    return items
      .filter((i) => !item || String(i.id) === item)
      .filter((i) => inclUntracked || i.stockTracked !== false)
      .filter((i) => inclInactive || i.active !== false)
      .filter((i) => inclZeroItem || columns.some((w) => (qtyOf.get(`${i.id}:${w.id}`) ?? 0) !== 0))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [stock, items, item, inclUntracked, inclInactive, inclZeroItem, columns, qtyOf])

  function openEntry() {
    if (picked.size === 0) {
      setError('리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.')
      return
    }
    const ids = rows.filter((r) => picked.has(r.id)).map((r) => r.id)
    const init: Record<string, string> = {}
    for (const id of ids) for (const w of columns) init[`${id}:${w.id}`] = String(qtyOf.get(`${id}:${w.id}`) ?? 0)
    setCounts(init); setEmployee(''); setError(''); setEntry(ids)
  }

  async function save() {
    if (!entry) return
    const changed = Object.entries(counts).filter(([k, v]) => v.trim() !== '' && Number(v) !== (qtyOf.get(k) ?? 0))
    setSaving(true); setError('')
    try {
      for (const [k, v] of changed) {
        const [itemId, warehouseId] = k.split(':').map(Number)
        await api.post('/stock-adjustments', {
          type: 'ADJUST', itemId, warehouseId, actualQty: Number(v), adjustDate: date,
          employeeId: employee ? Number(employee) : null,
        })
      }
      setEntry(null)
      await search()
      setNotice('요청된 [간편재고조정] 작업이 완료되었습니다.')
      onDone?.()
    } catch (e) { setError(extractErrorMessage(e)) } finally { setSaving(false) }
  }

  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id))

  /*
   * 문서 끝에 그린다 — …조회 화면(EcListShell)은 접힌 조건 판을 '.ec-cond' 로 찾아 감추는데,
   * 이 창이 그 안에 그려지면 창의 조건 판까지 같이 감춰졌다.
   */
  return createPortal(
    <>
      <Modal open={open} title="간편재고조정" onClose={onClose} width={1100} error={entry ? null : error}>
        <ul className="ec-cond mb-[8px]">
          <EcCond label="기준일자">
            <input type="date" className="ec-input w-[145px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </EcCond>
          <EcCond label="창고" pick>
            <CodePickerField label="창고" hideLabel width={220} emptyLabel="전체" value={warehouse} onChange={setWarehouse}
                             items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
          </EcCond>
          <EcCond label="품목코드" pick>
            <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
          </EcCond>
          <EcCond label="기타">
            <label className="mr-[10px] text-[12px]"><input type="checkbox" checked={inclUntracked} onChange={(e) => setInclUntracked(e.target.checked)} /> 수량관리제외품목포함</label>
            <label className="mr-[10px] text-[12px]"><input type="checkbox" checked={inclZeroWh} onChange={(e) => setInclZeroWh(e.target.checked)} /> 재고수량0창고포함</label>
            <label className="mr-[10px] text-[12px]"><input type="checkbox" checked={inclZeroItem} onChange={(e) => setInclZeroItem(e.target.checked)} /> 재고수량0품목포함</label>
            <label className="text-[12px]"><input type="checkbox" checked={inclInactive} onChange={(e) => setInclInactive(e.target.checked)} /> 사용중단품목포함</label>
          </EcCond>
        </ul>
        <div className="flex flex-wrap gap-[4px] mb-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
          {/* 하루를 고르는 창이라 빠른선택은 그 기간의 끝날을 넣고 바로 찾는다(원본 [금일] · [전월] 실측). */}
          {PICKS.map((p) => (
            <button key={p} type="button" className="ec-btn" onClick={() => { const d = periodOf(p)?.to ?? ymd(new Date()); setDate(d); void search(d) }}>{p}</button>
          ))}
          <button type="button" className="ec-btn" onClick={() => { setDate(periodOf('전월')!.to); setWarehouse(''); setItem(''); setInclUntracked(false); setInclZeroWh(true); setInclZeroItem(false); setInclInactive(true) }}>다시 작성</button>
        </div>
        {notice && <p className="ec-alert ec-alert-success mb-[8px]">{notice}</p>}
        {stock && (
          <>
            <p className="text-right text-[12px] mb-[4px]">{date.replace(/-/g, '/')}</p>
            <div className="overflow-x-auto max-h-[420px]">
              <table className="text-left">
                <thead>
                  <tr>
                    <th className="w-[34px] text-center">
                      <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                             onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
                    </th>
                    <th>품목코드</th>
                    <th>품목명</th>
                    <th>규격</th>
                    <th className="text-right">합계</th>
                    {columns.map((w) => <th key={w.id} className="text-right">{w.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5 + columns.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                  ) : rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="text-center text-ec-hint whitespace-nowrap">
                        <input type="checkbox" aria-label={`${i + 1}줄 선택`} checked={picked.has(r.id)}
                               onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                        {' '}{i + 1}
                      </td>
                      <td>{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.spec ?? ''}</td>
                      {/* 합계는 창고 조건과 상관없이 그 품목의 모든 창고 재고다(원본: 본사창고만 보아도 합계 799). */}
                      <td className="text-right">{qty([...qtyOf].filter(([k]) => k.startsWith(`${r.id}:`)).reduce((s, [, v]) => s + v, 0))}</td>
                      {columns.map((w) => <td key={w.id} className="text-right">{qty(qtyOf.get(`${r.id}:${w.id}`) ?? 0)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex gap-[4px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={openEntry}>조정</button>
          <button type="button" className="ec-btn" onClick={() => navigate('/inventory/items')}>품목등록</button>
          <button type="button" className="ec-btn" onClick={() => navigate('/inventory/warehouses')}>창고등록</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      <Modal open={!!entry} title="간편재고조정" onClose={() => setEntry(null)} width={1100} error={entry ? error : null}>
        <ul className="ec-cond mb-[8px]">
          <EcCond label="일자"><span className="text-[12.5px]">{date.replace(/-/g, '/')}</span></EcCond>
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel width={220} emptyLabel="" value={employee} onChange={setEmployee}
                             items={pickers.employees.map((e) => ({ ...e, value: String(e.id) }))} />
          </EcCond>
        </ul>
        <div className="overflow-x-auto">
          <table className="text-left">
            <thead>
              <tr>
                <th>품목코드</th>
                <th>품목명</th>
                <th>규격</th>
                {columns.map((w) => <th key={w.id} className="text-right">{w.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {(entry ?? []).map((id) => {
                const it = itemById.get(id)
                return (
                  <tr key={id}>
                    <td>{it?.code}</td>
                    <td>{it?.name}</td>
                    <td>{it?.spec ?? ''}</td>
                    {columns.map((w) => (
                      <td key={w.id}>
                        <input className="ec-input w-[90px] text-right" type="number" step="any" aria-label={`${it?.name} ${w.name}`}
                               value={counts[`${id}:${w.id}`] ?? ''}
                               onChange={(e) => setCounts((c) => ({ ...c, [`${id}:${w.id}`]: e.target.value }))} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-[4px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setEntry(null)}>닫기</button>
        </div>
      </Modal>
    </>,
    document.body,
  )
}
