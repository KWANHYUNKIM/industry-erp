import { useEffect, useMemo, useState } from 'react'
import CodePickerField from '../../components/CodePickerField'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { AllocationRow, Item, LocationStock, Warehouse, WarehouseLocation, WmsOverview } from '../../types/api'

const qty = (n: number) => n.toLocaleString('ko-KR')

/**
 * 재고 II > WMS — 창고 로케이션과 로케이션별 재고 배치.
 *
 * 창고 단위 재고가 진실이고, 로케이션 배치는 그 재고를 창고 안 어디에 두었는지 쪼갠 것이다.
 * 창고 재고 = 배치 + 미배치. 미배치는 입고했지만 아직 선반에 올리지 않은 물량이다.
 */
export default function WmsPage() {
  const [data, setData] = useState<WmsOverview | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [tab, setTab] = useState<'배치현황' | '로케이션'>('배치현황')
  const [showLocation, setShowLocation] = useState(false)
  const [work, setWork] = useState<'putaway' | 'move' | 'pick' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [w, wh, it] = await Promise.all([
        api.get<WmsOverview>('/wms'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<Item[]>('/items'),
      ])
      setData(w.data)
      setWarehouses(wh.data)
      setItems(it.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  const locations = useMemo(
    () => (data?.locations ?? []).filter((l) => !warehouseId || String(l.warehouseId) === warehouseId),
    [data, warehouseId],
  )
  const stocks = useMemo(
    () => (data?.locationStocks ?? []).filter((s) => !warehouseId || String(s.warehouseId) === warehouseId),
    [data, warehouseId],
  )
  const allocations = useMemo(
    () => (data?.allocations ?? []).filter((a) => !warehouseId || String(a.warehouseId) === warehouseId),
    [data, warehouseId],
  )
  const unallocatedTotal = allocations.reduce((a, r) => a + r.unallocatedQuantity, 0)

  async function removeLocation(l: WarehouseLocation) {
    if (!window.confirm(`로케이션 ${l.code}를 삭제할까요?`)) return
    try {
      await api.delete(`/wms/locations/${l.id}`)
      flash('로케이션을 삭제했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="WMS 로케이션" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div className="flex items-center gap-[6px] mb-[8px] flex-wrap">
        <select className="ec-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 160 }}>
          <option value="">전체 창고</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="ec-btn ec-btn-primary" onClick={() => setWork('putaway')}>적치</button>
        <button className="ec-btn" onClick={() => setWork('move')}>로케이션 이동</button>
        <button className="ec-btn" onClick={() => setWork('pick')}>피킹</button>
        <button className="ec-btn" onClick={() => setShowLocation(true)}>+ 로케이션 등록</button>
        <span className="text-[12px] text-ec-hint">
          창고 재고 = 배치 + 미배치. 미배치는 입고했지만 아직 선반에 올리지 않은 물량입니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <div className="flex gap-[10px] mb-[10px]">
        <Box label="로케이션" value={`${locations.length} 개`} color="var(--ec-blue-dark)" bg="var(--ec-bg-page)" />
        <Box label="적치된 품목·로케이션" value={`${stocks.length} 건`} color="var(--ec-blue)" bg="var(--ec-blue-wash)" />
        <Box label="미배치 수량 합계" value={qty(unallocatedTotal)} color={unallocatedTotal > 0 ? 'var(--ec-danger)' : '#2f8401'} bg={unallocatedTotal > 0 ? 'var(--ec-danger-bg)' : 'var(--ec-success-bg)'} />
      </div>

      <div className="flex gap-[2px] mb-[6px] border-b border-b-ec-line border-solid">
        {(['배치현황', '로케이션'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      {tab === '배치현황' ? (
        <>
          <div style={{ padding: '6px 8px', background: 'var(--ec-bg-page)', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            품목·창고별 배치 / 미배치
          </div>
          <table className="w-full text-left mb-[12px]">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th>창고</th>
                <th className="text-right">창고 재고</th>
                <th className="text-right">배치</th>
                <th className="text-right">미배치</th>
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 ? (
                <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : allocations.map((a: AllocationRow, i) => (
                <tr key={`${a.itemId}-${a.warehouseId}`}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{a.itemCode}</td>
                  <td>{a.itemName}</td>
                  <td>{a.warehouseName}</td>
                  <td className="text-right">{qty(a.stockQuantity)} {a.unit}</td>
                  <td style={{ textAlign: 'right', color: '#2f8401', fontWeight: 600 }}>{qty(a.allocatedQuantity)}</td>
                  <td style={{ textAlign: 'right', color: a.unallocatedQuantity > 0 ? 'var(--ec-danger)' : 'var(--ec-text-off)', fontWeight: 700 }}>
                    {qty(a.unallocatedQuantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ padding: '6px 8px', background: 'var(--ec-bg-page)', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            로케이션별 적치 재고
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th>창고</th>
                <th>로케이션</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th className="text-right">수량</th>
              </tr>
            </thead>
            <tbody>
              {stocks.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-ec-hint p-[20px]">적치된 재고가 없습니다. 「적치」로 선반에 올리세요.</td></tr>
              ) : stocks.map((s: LocationStock, i) => (
                <tr key={s.id}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{s.warehouseName}</td>
                  <td className="text-ec-blue font-semibold">{s.locationCode}</td>
                  <td>{s.itemCode}</td>
                  <td>{s.itemName}</td>
                  <td className="text-right font-semibold">{qty(s.quantity)} {s.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>창고</th>
              <th>로케이션 코드</th>
              <th>구역(Zone)</th>
              <th>랙(Rack)</th>
              <th>단(Level)</th>
              <th>설명</th>
              <th className="text-center">사용</th>
              <th className="text-center w-[50px]"></th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 ? (
              <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : locations.map((l, i) => (
              <tr key={l.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{l.warehouseName}</td>
                <td className="text-ec-blue font-semibold">{l.code}</td>
                <td>{l.zone ?? ''}</td>
                <td>{l.rack ?? ''}</td>
                <td>{l.level ?? ''}</td>
                <td className="text-ec-label">{l.description ?? ''}</td>
                <td style={{ textAlign: 'center', color: l.active ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>{l.active ? '사용' : '미사용'}</td>
                <td className="text-center">
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: 'var(--ec-danger)' }} onClick={() => removeLocation(l)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showLocation && (
        <LocationForm
          warehouses={warehouses}
          onClose={() => setShowLocation(false)}
          onSaved={() => { setShowLocation(false); flash('로케이션을 등록했습니다.'); load() }}
        />
      )}
      {work && data && (
        <WorkForm
          mode={work}
          locations={data.locations.filter((l) => l.active)}
          items={items}
          allocations={data.allocations}
          onClose={() => setWork(null)}
          onSaved={(msg) => { setWork(null); flash(msg); load() }}
        />
      )}
    </EcListShell>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div className="text-[12px] text-ec-label">{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function LocationForm({ warehouses, onClose, onSaved }: {
  warehouses: Warehouse[]; onClose: () => void; onSaved: () => void
}) {
  const [warehouseId, setWarehouseId] = useState('')
  const [code, setCode] = useState('')
  const [zone, setZone] = useState('')
  const [rack, setRack] = useState('')
  const [level, setLevel] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!warehouseId) return setError('창고를 선택하세요.')
    if (!code.trim()) return setError('로케이션 코드를 입력하세요.')
    setSaving(true)
    try {
      await api.post('/wms/locations', {
        warehouseId: Number(warehouseId),
        code: code.trim(),
        zone: zone.trim() || null,
        rack: rack.trim() || null,
        level: level.trim() || null,
        description: description.trim() || null,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="로케이션 등록" onClose={onClose} onSave={save} saving={saving} error={error}>
      <table className="w-full text-left">
        <tbody>
          <tr>
            <th className="w-[110px] bg-ec-page">창고<span className="text-ec-danger">*</span></th>
            <td>
              <select className="ec-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 180 }}>
                <option value="">창고 선택</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">로케이션 코드<span className="text-ec-danger">*</span></th>
            <td><input className="ec-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: A-01-3" style={{ width: 180 }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">구역 / 랙 / 단</th>
            <td className="flex gap-[4px]">
              <input className="ec-input" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Zone" style={{ width: 80 }} />
              <input className="ec-input" value={rack} onChange={(e) => setRack(e.target.value)} placeholder="Rack" style={{ width: 80 }} />
              <input className="ec-input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Level" style={{ width: 80 }} />
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">설명</th>
            <td><input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} /></td>
          </tr>
        </tbody>
      </table>
    </Modal>
  )
}

function WorkForm({ mode, locations, items, allocations, onClose, onSaved }: {
  mode: 'putaway' | 'move' | 'pick'
  locations: WarehouseLocation[]
  items: Item[]
  allocations: AllocationRow[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const title = mode === 'putaway' ? '적치 (미배치 → 로케이션)'
    : mode === 'move' ? '로케이션 이동 (같은 창고 안)'
      : '피킹 (로케이션 → 미배치)'

  // 적치할 때 이 품목이 어느 창고에 얼마나 미배치로 남아 있는지 보여준다
  const hint = useMemo(() => {
    if (mode !== 'putaway' || !itemId) return null
    const rows = allocations.filter((a) => String(a.itemId) === itemId && a.unallocatedQuantity > 0)
    if (rows.length === 0) return '이 품목은 미배치 수량이 없습니다.'
    return rows.map((a) => `${a.warehouseName} 미배치 ${a.unallocatedQuantity.toLocaleString()}${a.unit}`).join(' · ')
  }, [mode, itemId, allocations])

  async function save() {
    setError('')
    if (!itemId) return setError('품목을 선택하세요.')
    if (!locationId) return setError('로케이션을 선택하세요.')
    if (mode === 'move' && !toLocationId) return setError('도착 로케이션을 선택하세요.')
    if (!(Number(quantity) > 0)) return setError('수량은 0보다 커야 합니다.')
    setSaving(true)
    try {
      if (mode === 'putaway') {
        await api.post('/wms/putaway', { locationId: Number(locationId), itemId: Number(itemId), quantity: Number(quantity) })
        onSaved('적치했습니다.')
      } else if (mode === 'move') {
        await api.post('/wms/move', {
          fromLocationId: Number(locationId), toLocationId: Number(toLocationId),
          itemId: Number(itemId), quantity: Number(quantity),
        })
        onSaved('로케이션을 옮겼습니다.')
      } else {
        await api.post('/wms/pick', { locationId: Number(locationId), itemId: Number(itemId), quantity: Number(quantity) })
        onSaved('피킹했습니다. 미배치로 돌아갑니다.')
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} onSave={save} saving={saving} error={error}>
      <table className="w-full text-left">
        <tbody>
          <tr>
            <th className="w-[110px] bg-ec-page">품목<span className="text-ec-danger">*</span></th>
            <td>
              <CodePickerField label="품목" hideLabel width={240} placeholder="품목 선택" emptyLabel="선택 해제"
                               value={itemId} onChange={setItemId}
                               items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
              {hint && <div className="mt-[4px] text-[11.5px] text-ec-navy">{hint}</div>}
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">{mode === 'move' ? '출발 로케이션' : '로케이션'}<span className="text-ec-danger">*</span></th>
            <td>
              <select className="ec-input" value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ width: 240 }}>
                <option value="">로케이션 선택</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.warehouseName} · {l.code}</option>)}
              </select>
            </td>
          </tr>
          {mode === 'move' && (
            <tr>
              <th className="bg-ec-page">도착 로케이션<span className="text-ec-danger">*</span></th>
              <td>
                <select className="ec-input" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} style={{ width: 240 }}>
                  <option value="">로케이션 선택</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.warehouseName} · {l.code}</option>)}
                </select>
              </td>
            </tr>
          )}
          <tr>
            <th className="bg-ec-page">수량<span className="text-ec-danger">*</span></th>
            <td><input className="ec-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: 120, textAlign: 'right' }} /></td>
          </tr>
        </tbody>
      </table>
    </Modal>
  )
}

function Modal({ title, children, onClose, onSave, saving, error }: {
  title: string
  children: React.ReactNode
  onClose: () => void
  onSave: () => void
  saving: boolean
  error: string
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 520, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{title}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          {children}
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={onSave} disabled={saving}>{saving ? '처리 중…' : '확인(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
