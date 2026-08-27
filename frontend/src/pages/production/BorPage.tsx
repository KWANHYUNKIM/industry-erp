import { useEffect, useMemo, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { Item } from '../../api/types'

/**
 * 생산관리 > BOR(작업소요시간).
 *
 * <p>원본 열 실측(사본): 생산품목코드 · 생산품목명 · 품목구분 · 생산공정명 ·
 * <b>생산수량</b> · <b>작업순서</b> · <b>작업명</b> · <b>작업시간(H)</b>.
 * 품목마다 "어느 공정을 어떤 순서로 몇 시간 거치는가" 를 적어 두는 <b>마스터</b>다.
 *
 * <p>우리 화면은 공정 목록에 로트수량을 곱해 보여 주는 <b>계산기</b>였다. 품목이 아예 없었고,
 * 그래서 "이 제품을 만드는 데 표준 몇 시간" 을 어디서도 알 수 없었다. 그 여파로
 * 작업지시서효율현황의 '시간 표준' 은 <b>실제로 작업한 공정만</b> 되짚어 셀 수밖에 없었다 —
 * 빼먹은 공정은 표준에도 안 잡히니 영영 안 보인다.
 *
 * <p>BOM 이 "무엇으로 만드는가" 라면 BOR 은 "어떻게 만드는가" 다.
 */
interface BorRow {
  id: number
  productId: number
  productCode: string
  productName: string
  productUnit: string
  categoryName: string | null
  processId: number
  processCode: string
  processName: string
  seq: number
  workName: string
  baseQty: number
  workHours: number
  /** 1개당 작업시간(H) = 작업시간 ÷ 생산수량. 서버가 낸다. */
  hoursPerUnit: number
  remark: string | null
  active: boolean
}

interface ProcessRow { id: number; code: string; name: string; workcenter: string | null }

const emptyForm = { productId: '', processId: '', seq: '1', workName: '', baseQty: '1', workHours: '', remark: '' }

/** 소수시간을 시:분으로. 0.175H 는 10분 30초라 분까지 보여 준다. */
function hhmm(hours: number): string {
  const total = Math.round(hours * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function BorPage() {
  const [rows, setRows] = useState<BorRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  /**
   * 작업코드 마스터(공정등록 &gt; 작업코드등록). 있으면 작업명을 골라 쓴다 —
   * 자유입력만 두면 같은 작업이 '절단'·'절단작업'·'컷팅' 으로 갈라진다.
   * 마스터가 비어 있어도 자유입력은 그대로 되므로 막지 않는다.
   */
  const [operations, setOperations] = useState<{ id: number; processId: number; code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  /** 원본에는 없지만, 라우팅을 세워 놓고 "그럼 100개는 몇 시간인가" 를 바로 보고 싶어 남긴다. */
  const [lotSize, setLotSize] = useState('100')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [b, i, p, o] = await Promise.all([
        api.get<BorRow[]>('/bor'),
        api.get<Item[]>('/items'),
        api.get<ProcessRow[]>('/processes'),
        api.get<{ id: number; processId: number; code: string; name: string }[]>('/process-operations'),
      ])
      setRows(b.data); setItems(i.data); setProcesses(p.data); setOperations(o.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const set = (f: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [f]: v }))

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  function openEdit(r: BorRow) {
    setEditId(r.id)
    setForm({
      productId: String(r.productId), processId: String(r.processId),
      seq: String(r.seq), workName: r.workName,
      baseQty: String(r.baseQty), workHours: String(r.workHours), remark: r.remark ?? '',
    })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      productId: Number(form.productId), processId: Number(form.processId),
      seq: Number(form.seq), workName: form.workName,
      baseQty: Number(form.baseQty || 1), workHours: Number(form.workHours || 0),
      remark: form.remark || null, active: true,
    }
    try {
      if (editId != null) await api.put(`/bor/${editId}`, body)
      else await api.post('/bor', body)
      setShowForm(false)
      setForm({ ...emptyForm })
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: BorRow) {
    if (!confirm(`[${r.productName}] ${r.seq}. ${r.workName} 을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/bor/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword
    || r.productName.includes(keyword) || r.productCode.includes(keyword)
    || r.processName.includes(keyword) || r.workName.includes(keyword))

  /** 품목별 1개당 표준시간 합. 원본은 품목 아래에 작업을 늘어놓으므로 소계가 뜻을 갖는다. */
  const perProduct = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of shown) m.set(r.productId, (m.get(r.productId) ?? 0) + r.hoursPerUnit)
    return m
  }, [shown])

  const lot = Number(lotSize) || 0

  return (
    <EcListShell
      title="BOR(작업소요시간)"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      newLabel="신규(F2)"
      onNew={openCreate}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title={editId ? '작업 수정' : '작업 등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CodePickerField
              label="생산품목 *" placeholder="품목 선택"
              value={form.productId} onChange={(v) => set('productId', v)}
              items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.categoryName }))}
            />
            <CodePickerField
              label="생산공정 *" placeholder="공정 선택"
              value={form.processId} onChange={(v) => set('processId', v)}
              items={processes.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.workcenter ?? undefined }))}
            />
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업순서 *</label>
              <input className="ec-input w-full" type="number" value={form.seq} onChange={(e) => set('seq', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업명 *</label>
              <input className="ec-input w-full" list="bor-op-list" value={form.workName}
                     onChange={(e) => set('workName', e.target.value)} placeholder="예: 절단, 조립, 검사" />
              {/* 고른 공정의 작업코드를 먼저 보여 준다. 마스터가 비어 있으면 그냥 자유입력이다. */}
              <datalist id="bor-op-list">
                {operations
                  .filter((o) => !form.processId || String(o.processId) === form.processId)
                  .map((o) => <option key={o.id} value={o.name}>{o.code}</option>)}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산수량</label>
              <input className="ec-input w-full text-right" type="number" step="any" value={form.baseQty}
                     onChange={(e) => set('baseQty', e.target.value)} />
              <p style={{ fontSize: 11.5, color: '#8a929c', marginTop: 3 }}>
                아래 작업시간이 <b>몇 개를 만드는 기준</b>인지. 1개 기준이면 1, 100개 로트 기준이면 100.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업시간(H) *</label>
              <input className="ec-input w-full text-right" type="number" step="any" value={form.workHours}
                     onChange={(e) => set('workHours', e.target.value)} placeholder="예: 1.5" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">적요</label>
              <input className="ec-input w-full" value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '저장' : '등록'}</button>
          </div>
        </form>
      )}</Modal>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="생산품목·공정" pick>
          <input className="ec-input" placeholder="품목·공정·작업명 일부" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="로트수량">
          <input className="ec-input text-right" type="number" value={lotSize}
                 onChange={(e) => setLotSize(e.target.value)} style={{ width: 100 }} />
          <span style={{ fontSize: 11.5, color: '#8a929c' }}>이 수량을 만들 때의 시간을 함께 보여 줍니다.</span>
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>생산품목코드</th>
              <th>생산품목명</th>
              <th style={{ width: 80 }}>품목구분</th>
              <th>생산공정명</th>
              <th style={{ width: 80, textAlign: 'right' }}>생산수량</th>
              <th style={{ width: 80, textAlign: 'right' }}>작업순서</th>
              <th>작업명</th>
              <th style={{ width: 100, textAlign: 'right' }}>작업시간(H)</th>
              <th style={{ width: 100, textAlign: 'right' }}>1개당(H)</th>
              <th style={{ width: 110, textAlign: 'right' }}>{lot.toLocaleString('ko-KR')}개 소요</th>
              <th style={{ width: 80, textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => {
              const first = i === 0 || shown[i - 1].productId !== r.productId
              return (
                <tr key={r.id} style={first && i > 0 ? { borderTop: '2px solid #d7dce3' } : undefined}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{first ? r.productCode : ''}</td>
                  <td>{first ? r.productName : ''}</td>
                  <td style={{ color: '#5a626e' }}>{first ? (r.categoryName ? `[${r.categoryName}]` : '') : ''}</td>
                  <td>{r.processName}</td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.baseQty.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right' }}>{r.seq}</td>
                  <td>{r.workName}</td>
                  <td style={{ textAlign: 'right' }}>{r.workHours.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.hoursPerUnit.toFixed(4)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{hhmm(r.hoursPerUnit * lot)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => openEdit(r)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={9} style={{ textAlign: 'right' }}>
                  품목 {perProduct.size}개 · 작업 {shown.length}줄
                </td>
                <td style={{ textAlign: 'right' }}>
                  {[...perProduct.values()].reduce((n, v) => n + v, 0).toFixed(4)}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                  {hhmm([...perProduct.values()].reduce((n, v) => n + v, 0) * lot)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
