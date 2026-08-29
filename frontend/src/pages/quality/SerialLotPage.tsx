import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Lot, LotStatus, LotTransaction, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const today = () => ymd(new Date())

const statusColor = (s: LotStatus) => (s === 'HOLD' ? '#c07a00' : s === 'SHIPPED' ? '#8a929c' : '#1c7c3c')

/** 재고 II > 시리얼/로트No. — 로트별 입고/현재고/보류 추적 (실연동) */
export default function SerialLotPage() {
  const [rows, setRows] = useState<Lot[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [keyword, setKeyword] = useState('')
  const [onlyStock, setOnlyStock] = useState(false)
  /*
   * 원본 시리얼/로트No.등록 조건: 유효기한 · 품목 · <b>시리얼/로트No.</b> · <b>사용구분</b>.
   * 로트번호는 검색상자로만 걸렀는데 그 상자는 <b>품목명까지</b> 훑는다 —
   * 번호를 정확히 알아도 엉뚱한 로트가 같이 걸렸다. 상태도 표에는 찍히는데 못 골랐다.
   */
  const [lotCond, setLotCond] = useState('')
  const [useCond, setUseCond] = useState('')
  const [loading, setLoading] = useState(true)
  /*
   * 원본 [상세내역] — 펼친 로트의 입출고. <b>펼칠 때 한 번만</b> 가져와 들고 있는다:
   * 목록을 열 때 미리 부르면 안 볼 것까지 부르고, 펼칠 때마다 부르면 같은 것을 또 부른다.
   */
  const [openLot, setOpenLot] = useState<string | null>(null)
  const [lotTx, setLotTx] = useState<LotTransaction[]>([])
  const [lotTxLoaded, setLotTxLoaded] = useState(false)
  async function toggleDetail(r: Lot) {
    if (openLot === r.lotNo) { setOpenLot(null); return }
    setOpenLot(r.lotNo)
    if (lotTxLoaded) return
    try {
      setLotTx((await api.get<LotTransaction[]>('/lots/transactions')).data)
      setLotTxLoaded(true)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ lotNo: '', itemId: '', warehouseId: '', inboundDate: today(), expireDate: '', inboundQty: '' })

  async function load() {
    setLoading(true)
    try {
      const [l, i, w] = await Promise.all([
        api.get<Lot[]>('/lots'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setRows(l.data)
      setItems(i.data)
      setWarehouses(w.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.lotNo.trim()) return setError('로트No.를 입력하세요.')
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (!form.inboundQty || Number(form.inboundQty) <= 0) return setError('입고수량을 입력하세요.')
    try {
      await api.post('/lots', {
        lotNo: form.lotNo,
        itemId: Number(form.itemId),
        warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
        inboundDate: form.inboundDate,
        expireDate: form.expireDate || undefined,
        inboundQty: Number(form.inboundQty),
      })
      setForm({ lotNo: '', itemId: '', warehouseId: '', inboundDate: today(), expireDate: '', inboundQty: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function consume(lot: Lot) {
    const v = window.prompt(`[${lot.lotNo}] 출고수량 (현재고 ${lot.stockQty})`, '')
    if (v === null) return
    const qty = Number(v)
    if (!qty || qty <= 0) return
    try {
      await api.patch(`/lots/${lot.id}/consume`, { qty })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function toggleHold(lot: Lot) {
    try {
      await api.patch(`/lots/${lot.id}/hold`, { held: !lot.held })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function adjust(lot: Lot) {
    const v = window.prompt(`[${lot.lotNo}] 실사수량 (현재고 ${lot.stockQty})`, String(lot.stockQty))
    if (v === null) return
    const actualQty = Number(v)
    if (!Number.isFinite(actualQty) || actualQty < 0) { alert('0 이상 숫자를 입력하세요.'); return }
    try {
      await api.patch(`/lots/${lot.id}/adjust`, { actualQty, note: '실사' })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shownRows = rows
    .filter((r) => !keyword || r.lotNo.includes(keyword) || r.itemName.includes(keyword))
    .filter((r) => !onlyStock || r.stockQty > 0)
    .filter((r) => !lotCond || r.lotNo.includes(lotCond))
    .filter((r) => !useCond || r.statusName === useCond)

  /*
   * 네 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. [상태]는 저장된 값이 아니라
   * 수량·보류에서 파생되는 이름이므로, 정렬도 <b>파생된 이름</b>으로 한다.
   */
  const sort = useTableSort(shownRows, {
    '로트No.': (r) => r.lotNo,
    품목명: (r) => r.itemName,
    입고일: (r) => r.inboundDate,
    상태: (r) => r.statusName,
  })
  const shown = sort.sorted

  return (
    <EcListShell
      title="시리얼/로트No. 관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '로트등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="시리얼/로트No. 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>로트 등록(입고)</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>로트No. *</div>
              <input className="ec-input" value={form.lotNo} onChange={(e) => set('lotNo', e.target.value)} placeholder="LOT-260707-01" style={{ width: 160 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <select className="ec-input" value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>창고</div>
              <select className="ec-input" value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} style={{ width: 140 }}>
                <option value="">(미지정)</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>입고일</div>
              <input className="ec-input" type="date" value={form.inboundDate} onChange={(e) => set('inboundDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>유효기한</div>
              <input className="ec-input" type="date" value={form.expireDate} onChange={(e) => set('expireDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>입고수량 *</div>
              <input className="ec-input" type="number" step="any" value={form.inboundQty} onChange={(e) => set('inboundQty', e.target.value)} style={{ width: 100 }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
          </div>
        </div>
      )}</Modal>

      {/* 원본 조건 차례: … 시리얼/로트No. · 사용구분 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="시리얼/로트No.">
          <input className="ec-input" value={lotCond} placeholder="시리얼/로트No."
                 onChange={(e) => setLotCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="사용구분">
          <select className="ec-input" value={useCond} style={{ width: 110 }}
                  onChange={(e) => setUseCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => r.statusName))].map((n) => <option key={n}>{n}</option>)}
          </select>
        </EcCond>
      </ul>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12.5, color: '#3a4453', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} style={{ marginRight: 5, verticalAlign: 'middle' }} />
          재고보유 로트만 보기
        </label>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/* 원본 이름은 [로트No.] 가 아니라 <b>[시리얼/로트No.]</b> 다(사본 실측). */}
            <th style={{ width: 150, cursor: 'pointer' }} onClick={() => sort.toggle('로트No.')}>시리얼/로트No. {sort.mark('로트No.')}</th>
            {/*
              원본 열은 <b>[품목명[규격]] · [규격]</b> 두 칸이다(사본 실측).
              규격이 로트 응답에 없어 못 만들던 것을 이번에 실었다.
            */}
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목명')}>품목명[규격] {sort.mark('품목명')}</th>
            <th style={{ width: 110 }}>규격</th>
            <th style={{ width: 100, cursor: 'pointer' }} onClick={() => sort.toggle('입고일')}>입고일 {sort.mark('입고일')}</th>
            <th style={{ width: 100 }}>유효기한</th>
            <th style={{ width: 80, textAlign: 'right' }}>입고수량</th>
            <th style={{ width: 80, textAlign: 'right' }}>현재고</th>
            <th style={{ width: 100 }}>창고</th>
            <th style={{ width: 80, textAlign: 'center', cursor: 'pointer' }} onClick={() => sort.toggle('상태')}>상태 {sort.mark('상태')}</th>
            {/*
              원본 시리얼/로트No.등록의 마지막 열 <b>[상세내역]</b> — 그 로트가 <b>어디로 오갔는지</b>를
              그 자리에서 편다. 로트원장이 따로 있긴 하지만 화면을 옮겨 로트를 다시 골라야 했다 —
              "이 로트 어디 갔나" 를 묻는 자리는 여기다.
            */}
            <th style={{ width: 66, textAlign: 'center' }}>상세내역</th>
            <th style={{ width: 130, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => [
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.lotNo}</td>
              <td>{r.itemName}{r.spec ? `[${r.spec}]` : ''}</td>
              <td style={{ color: '#5a626e' }}>{r.spec ?? ''}</td>
              <td>{dateText(r.inboundDate)}</td>
              <td>{dateText(r.expireDate) || ''}</td>
              <td style={{ textAlign: 'right' }}>{r.inboundQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: r.stockQty > 0 ? 700 : 400, color: r.stockQty === 0 ? '#9aa1ab' : undefined }}>{r.stockQty.toLocaleString()}</td>
              <td>{r.warehouseName ?? ''}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.statusName}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => toggleDetail(r)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  {openLot === r.lotNo ? '접기' : '펼치기'}
                </button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} disabled={r.held || r.stockQty <= 0} onClick={() => consume(r)}>출고</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px', marginLeft: 3 }} onClick={() => adjust(r)}>실사</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px', marginLeft: 3, color: r.held ? '#1c7c3c' : '#c07a00' }} onClick={() => toggleHold(r)}>{r.held ? '해제' : '보류'}</button>
              </td>
            </tr>,
            openLot === r.lotNo ? (
              /* 펼친 줄 — 그 로트의 입출고. 움직인 적이 없으면 그렇게 적는다(빈 표를 그리지 않는다). */
              <tr key={`${r.id}-detail`}>
                <td colSpan={12} style={{ background: '#fbfcfe', padding: '8px 14px' }}>
                  {lotTx.filter((t) => t.lotNo === r.lotNo).length === 0 ? (
                    <span style={{ fontSize: 12, color: '#9aa1ab' }}>움직인 내역이 없습니다.</span>
                  ) : (
                    <table className="w-full text-left" style={{ maxWidth: 760 }}>
                      <thead><tr>
                        <th style={{ width: 34 }}></th><th style={{ width: 110 }}>일자</th>
                        <th style={{ width: 90 }}>구분</th>
                        <th style={{ width: 90, textAlign: 'right' }}>수량</th>
                        <th style={{ width: 90, textAlign: 'right' }}>잔량</th>
                        <th>적요</th>
                      </tr></thead>
                      <tbody>
                        {lotTx.filter((t) => t.lotNo === r.lotNo).map((t, k) => (
                          <tr key={t.id}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{k + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{dateText(t.txDate)}</td>
                            <td>{t.typeName}</td>
                            <td style={{ textAlign: 'right', color: t.quantityChange < 0 ? '#c60a2e' : '#1c7c3c' }}>
                              {t.quantityChange.toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.balanceAfter.toLocaleString()}</td>
                            <td style={{ color: '#8a929c' }}>{t.note ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>
            ) : null,
          ]).flat()}
        </tbody>
      </table>
    </EcListShell>
  )
}
