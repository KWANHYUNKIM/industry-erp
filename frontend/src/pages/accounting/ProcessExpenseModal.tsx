import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import type { Warehouse } from '../../api/types'

/**
 * 노무비/경비등록 — 원가계산 전 사전작업.
 *
 * <p>원본(이카운트) 원가생성/수정의 [사전작업] &gt; [노무비/경비등록] 이다. 별도 메뉴가 아니라
 * 원가생성 화면에서 여는 자리라, 우리도 메뉴를 새로 만들지 않고 같은 화면에서 연다.
 *
 * <p>원본 열 실측(사본 열 id): 공정명(PLANT_DES) · 창고코드(WH_CD) · 창고명(WH_DES) ·
 * 노무비(LABOR_XPNS) · 경비(ETC_XPNT).
 *
 * <p>여기 적은 총액이 <b>실제원가 계산</b>의 유일한 근거다. 노무비는 공정 마스터의 시간당
 * 비용으로 표준을 낼 수 있지만 <b>경비는 요율이 아예 없어</b>, 이 표가 비어 있으면
 * 실제경비는 어디에도 붙지 않는다.
 */
interface Row {
  id: number
  period: string
  processId: number
  processCode: string
  processName: string
  warehouseId: number | null
  warehouseCode: string | null
  warehouseName: string | null
  laborCost: number
  overheadCost: number
  remark: string | null
}

/** active — 원본은 사용중단한 공정을 코드도움에 안 띄운다. */
interface ProcessRow { id: number; code: string; name: string; workcenter: string | null; active: boolean }

const won = (n: number) => n.toLocaleString('ko-KR')

export default function ProcessExpenseModal({ period, onClose }: { period: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [form, setForm] = useState({ processId: '', warehouseId: '', laborCost: '', overheadCost: '', remark: '' })
  const [editId, setEditId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [e, p, w] = await Promise.all([
        api.get<Row[]>('/process-expenses', { params: { period } }),
        api.get<ProcessRow[]>('/processes'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setRows(e.data); setProcesses(p.data); setWarehouses(w.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [period])

  const set = (f: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [f]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      period,
      processId: Number(form.processId),
      warehouseId: form.warehouseId ? Number(form.warehouseId) : null,
      laborCost: Number(form.laborCost || 0),
      overheadCost: Number(form.overheadCost || 0),
      remark: form.remark || null,
    }
    try {
      if (editId != null) await api.put(`/process-expenses/${editId}`, body)
      else await api.post('/process-expenses', body)
      setForm({ processId: '', warehouseId: '', laborCost: '', overheadCost: '', remark: '' })
      setEditId(null)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  function openEdit(r: Row) {
    setEditId(r.id)
    setForm({
      processId: String(r.processId),
      warehouseId: r.warehouseId != null ? String(r.warehouseId) : '',
      laborCost: String(r.laborCost), overheadCost: String(r.overheadCost), remark: r.remark ?? '',
    })
  }

  async function remove(r: Row) {
    if (!confirm(`${r.processName} 의 노무비/경비를 삭제할까요?`)) return
    try {
      await api.delete(`/process-expenses/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const totals = rows.reduce((a, r) => ({ lab: a.lab + r.laborCost, oh: a.oh + r.overheadCost }), { lab: 0, oh: 0 })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 860, maxWidth: '94vw', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
          <span>노무비/경비등록 · {period}</span>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
        <div style={{ padding: 14 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#5a626e' }}>
            그 달 <b>공정별로 실제 들어간</b> 노무비·경비 총액을 적습니다.
            실제원가 계산이 이 값을 <b>표준 작업시간 비율</b>로 품목에 나눠 붙입니다.
          </p>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

          <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e6eaef' }}>
            <div style={{ width: 200 }}>
              <CodePickerField
                label="공정 *" placeholder="공정 선택"
                value={form.processId} onChange={(v) => set('processId', v)}
                items={processes.filter((p) => p.active !== false).map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.workcenter ?? undefined }))}
              />
            </div>
            <div style={{ width: 200 }}>
              <CodePickerField
                label="창고" placeholder="전사 공통" emptyLabel="전사 공통"
                value={form.warehouseId} onChange={(v) => set('warehouseId', v)}
                items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))}
              />
            </div>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>노무비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.laborCost}
                     onChange={(e) => set('laborCost', e.target.value)} style={{ width: 130 }} />
            </label>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>경비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.overheadCost}
                     onChange={(e) => set('overheadCost', e.target.value)} style={{ width: 130 }} />
            </label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 140 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>적요</div>
              <input className="ec-input w-full" value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </label>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '저장' : '추가'}</button>
            {editId != null && (
              <button type="button" className="ec-btn" onClick={() => {
                setEditId(null)
                setForm({ processId: '', warehouseId: '', laborCost: '', overheadCost: '', remark: '' })
              }}>취소</button>
            )}
          </form>

          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>공정명</th>
                <th style={{ width: 100 }}>창고코드</th>
                <th>창고명</th>
                <th style={{ width: 130, textAlign: 'right' }}>노무비</th>
                <th style={{ width: 130, textAlign: 'right' }}>경비</th>
                <th>적요</th>
                <th style={{ width: 80, textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>{r.processName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.warehouseCode ?? ''}</td>
                  <td style={{ color: r.warehouseName ? undefined : '#8a929c' }}>{r.warehouseName ?? '전사 공통'}</td>
                  <td style={{ textAlign: 'right' }}>{won(r.laborCost)}</td>
                  <td style={{ textAlign: 'right' }}>{won(r.overheadCost)}</td>
                  <td style={{ color: '#5a626e' }}>{r.remark ?? ''}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => openEdit(r)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                  <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({rows.length}공정)</td>
                  <td style={{ textAlign: 'right' }}>{won(totals.lab)}</td>
                  <td style={{ textAlign: 'right' }}>{won(totals.oh)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
