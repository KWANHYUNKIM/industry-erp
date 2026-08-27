import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 작업코드등록 — 원본 공정등록의 [작업코드등록] 버튼이 여는 자리.
 *
 * <p>공정 안에서 하는 작업들을 마스터로 둔다. BOR(작업소요시간)의 작업명을 자유입력으로
 * 두면 같은 작업이 '절단'·'절단작업'·'컷팅' 으로 여러 이름이 되고, 그러면 공정별 집계가
 * 갈라진다. 여기서 한 번 정해 두면 이름이 하나로 모인다.
 *
 * <p>별도 메뉴를 만들지 않았다 — 원본도 공정등록 화면에서 여는 자리다.
 */
interface Row {
  id: number
  processId: number
  processCode: string
  processName: string
  code: string
  name: string
  seq: number
  active: boolean
}

interface ProcessRow { id: number; code: string; name: string; sortOrder: number }

export default function ProcessOperationModal({ processes, onClose }: {
  processes: ProcessRow[]
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState({ processId: '', code: '', name: '', seq: '1' })
  const [editId, setEditId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setRows((await api.get<Row[]>('/process-operations')).data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      processId: Number(form.processId),
      code: form.code, name: form.name,
      seq: Number(form.seq || 0), active: true,
    }
    try {
      if (editId != null) await api.put(`/process-operations/${editId}`, body)
      else await api.post('/process-operations', body)
      setForm({ processId: form.processId, code: '', name: '', seq: String(Number(form.seq || 0) + 1) })
      setEditId(null)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: Row) {
    if (!confirm(`작업코드 '${r.code} ${r.name}' 을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/process-operations/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 720, maxWidth: '92vw', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
          <span>작업코드등록</span>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
        <div style={{ padding: 14 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#5a626e' }}>
            공정 안에서 하는 작업들입니다. BOR(작업소요시간)의 작업명을 여기서 골라 쓰면
            같은 작업이 여러 이름으로 갈라지지 않습니다.
          </p>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

          <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e6eaef' }}>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>공정 *</div>
              <select className="ec-input" value={form.processId} style={{ width: 170 }}
                      onChange={(e) => setForm({ ...form, processId: e.target.value })}>
                <option value="">선택</option>
                {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>작업코드 *</div>
              <input className="ec-input" value={form.code} style={{ width: 130 }}
                     onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="OP-010" />
            </label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 140 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>작업명 *</div>
              <input className="ec-input w-full" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>순서</div>
              <input className="ec-input text-right" type="number" value={form.seq} style={{ width: 80 }}
                     onChange={(e) => setForm({ ...form, seq: e.target.value })} />
            </label>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '저장' : '추가'}</button>
            {editId != null && (
              <button type="button" className="ec-btn" onClick={() => {
                setEditId(null)
                setForm({ processId: '', code: '', name: '', seq: '1' })
              }}>취소</button>
            )}
          </form>

          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 140 }}>공정명</th>
                <th style={{ width: 120 }}>작업코드</th>
                <th>작업명</th>
                <th style={{ width: 70, textAlign: 'right' }}>순서</th>
                <th style={{ width: 80, textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>{r.processName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                  <td>{r.name}</td>
                  <td style={{ textAlign: 'right' }}>{r.seq}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => {
                      setEditId(r.id)
                      setForm({ processId: String(r.processId), code: r.code, name: r.name, seq: String(r.seq) })
                    }} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
