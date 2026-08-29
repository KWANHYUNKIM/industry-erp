import { useEffect, useMemo, useState } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StagedAdjustment, StagedStatus, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useCondPickers } from '../../utils/useCondPickers'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { useSearchParams } from 'react-router-dom'
import { dateText } from '../../utils/dateText'

/**
 * 재고 > 단계별재고조정 / 재고조정진행단계 (이카운트 E040604·E040650)
 * 실사수량을 요청 → 승인(반영)/반려 단계로 처리. 즉시 반영하는 기타이동 재고조정과 달리 승인 단계를 둔다.
 * 반영 시 일반 재고조정(ADJUST)을 생성해 실제 재고에 반영한다. 백엔드 신설: /api/staged-adjustments.
 */

const today = () => ymd(new Date())
type Tab = 'ALL' | StagedStatus
const TABS: { v: Tab; label: string }[] = [
  { v: 'ALL', label: '전체' },
  { v: 'REQUESTED', label: '요청(대기)' },
  { v: 'APPLIED', label: '반영완료' },
  { v: 'REJECTED', label: '반려' },
]
const statusColor = (s: StagedStatus) => (s === 'REQUESTED' ? '#c07a00' : s === 'APPLIED' ? '#1c7c3c' : '#c60a2e')
const num = (n: number) => n.toLocaleString('ko-KR')

export default function StagedAdjustmentPage() {
  const [rows, setRows] = useState<StagedAdjustment[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [tab, setTab] = useState<Tab>('ALL')
  const [keyword, setKeyword] = useState('')
  /* 원본 단계별재고조정 조건에 <b>[적요]</b> 가 있다(사본 실측). 사유는 이미 목록에 온다. */
  const [reasonCond, setReasonCond] = useState('')
  /* 원본 조건 [창고]. 창고는 목록에 찍히는데 그것으로 거를 수가 없었다. */
  const [whCond, setWhCond] = useState('')
  const pickers = useCondPickers(['warehouses'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 품목등록에서 <b>고른 품목을 물고</b> 넘어온다(?item=id). 원본 품목등록의 [재고조정]이
   * 그 자리에서 조정 화면을 여는데, 우리는 메뉴로 옮겨 가 품목을 다시 찾아야 했다.
   */
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({
    itemId: searchParams.get('item') ?? '', warehouseId: '', actualQty: '',
    requestDate: today(), reason: '',
  })
  /** 품목을 물고 왔으면 조정 폼을 바로 연다 — 한 번 더 누르게 하지 않는다. */
  const [showForm, setShowForm] = useState(Boolean(searchParams.get('item')))

  async function load() {
    setLoading(true)
    try {
      const [s, i, w] = await Promise.all([
        api.get<StagedAdjustment[]>('/staged-adjustments'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setRows(s.data); setItems(i.data); setWarehouses(w.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (!form.warehouseId) return setError('창고를 선택하세요.')
    if (form.actualQty === '') return setError('실사수량을 입력하세요.')
    try {
      await api.post('/staged-adjustments', {
        itemId: Number(form.itemId), warehouseId: Number(form.warehouseId),
        actualQty: Number(form.actualQty), requestDate: form.requestDate, reason: form.reason || undefined,
      })
      setForm((f) => ({ ...f, itemId: '', warehouseId: '', actualQty: '', reason: '' }))
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function act(r: StagedAdjustment, kind: 'apply' | 'reject') {
    if (kind === 'apply' && !confirm(`${r.adjustNo}을(를) 반영할까요? 재고가 ${num(r.actualQty)}(으)로 조정됩니다.`)) return
    try { await api.post(`/staged-adjustments/${r.id}/${kind}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function remove(r: StagedAdjustment) {
    if (!confirm(`${r.adjustNo}을(를) 삭제할까요?`)) return
    try { await api.delete(`/staged-adjustments/${r.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = useMemo(() => rows
    .filter((r) => tab === 'ALL' || r.status === tab)
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.adjustNo.includes(keyword) || r.warehouseName.includes(keyword))
    .filter((r) => !whCond || r.warehouseName === whCond)
    .filter((r) => !reasonCond || (r.reason ?? '').includes(reasonCond)),
  [rows, tab, keyword, reasonCond, whCond])
  const count = (t: Tab) => (t === 'ALL' ? rows.length : rows.filter((r) => r.status === t).length)
  const inputCls = 'ec-input'


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    요청일: (r) => r.requestDate,
  })

  return (
    <EcListShell
      title="단계별재고조정"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">실사수량을 요청 → 승인(반영)/반려. 반영 시 재고가 실사수량으로 조정됩니다(기타이동 재고조정 탭에도 기록).</p>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="단계별재고조정 요청" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>요청일자</div>
              <input className={inputCls} type="date" value={form.requestDate} onChange={(e) => set('requestDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <CodePickerField label="품목" hideLabel width={220} placeholder="선택하세요" emptyLabel="선택 해제"
                           value={form.itemId} onChange={(v) => set('itemId', v)}
                           items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>창고 *</div>
              <select className={inputCls} value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} style={{ width: 160 }}>
                <option value="">선택하세요</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>실사수량 *</div>
              <input className={`${inputCls} text-right`} type="number" step="any" value={form.actualQty} onChange={(e) => set('actualQty', e.target.value)} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>사유</div>
              <input className={inputCls} value={form.reason} onChange={(e) => set('reason', e.target.value)} style={{ width: '100%' }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>요청</button>
          </div>
        </div>
      )}</Modal>

      {/* 원본 단계별재고조정 조건의 <b>[적요]</b>. 사유는 목록에 이미 찍히는데 그것으로 거를 수가 없었다. */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="창고">
          {/* 마스터를 고르는 칸은 드롭다운이 아니라 코드도움이다. */}
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={reasonCond}
                 onChange={(e) => setReasonCond(e.target.value)} style={{ width: 200 }} />
        </EcCond>
      </ul>

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: tab === t.v ? 'var(--ec-blue)' : '#fff', color: tab === t.v ? '#fff' : '#3a4453', fontWeight: tab === t.v ? 700 : 400,
          }}>{t.label} ({count(t.v)})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>조정번호</th>
            <th style={{ width: 100, cursor: 'pointer' }} onClick={() => sort.toggle('요청일')}>요청일 {sort.mark('요청일')}</th>
            <th>품목</th>
            <th>창고</th>
            <th style={{ textAlign: 'right' }}>장부수량</th>
            <th style={{ textAlign: 'right' }}>실사수량</th>
            <th style={{ textAlign: 'right' }}>차이</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ width: 160, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.adjustNo}</td>
              <td>{dateText(r.requestDate)}</td>
              <td>{r.itemName}</td>
              <td>{r.warehouseName}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.bookQty)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(r.actualQty)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.diff > 0 ? '#1c7c3c' : r.diff < 0 ? '#c60a2e' : '#c5cbd3' }}>{r.diff > 0 ? '+' : ''}{num(r.diff)}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.statusName}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {r.status === 'REQUESTED' ? (
                  <>
                    <button className="no-ec" onClick={() => act(r, 'apply')} style={{ border: 'none', background: 'none', color: '#1c7c3c', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>반영</button>
                    <button className="no-ec" onClick={() => act(r, 'reject')} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>반려</button>
                    <button className="no-ec" onClick={() => remove(r)} style={{ border: 'none', background: 'none', color: '#8a929c', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </>
                ) : <span style={{ color: '#c5cbd3', fontSize: 12 }}>{r.handler ?? '—'}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
