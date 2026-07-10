import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { WorkJournal } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = (d: string) => (d ? DOW[new Date(d).getDay()] : '')

/** 그룹웨어 > 업무관리 > 업무일지 — 실제 일지 목록 + 작성 */
export default function WorkLogPage() {
  const [rows, setRows] = useState<WorkJournal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ reportDate: today(), department: '', partnerName: '', title: '', content: '' })

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<WorkJournal[]>('/work-journals')
      setRows(r.data)
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
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    if (!form.content.trim()) return setError('내용을 입력하세요.')
    try {
      await api.post('/work-journals', {
        reportDate: form.reportDate,
        department: form.department || undefined,
        partnerName: form.partnerName || undefined,
        title: form.title,
        content: form.content,
      })
      setForm({ reportDate: today(), department: '', partnerName: '', title: '', content: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>업무일지</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="ec-btn" onClick={load}>새로고침</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {showForm && (
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 16, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>업무일지 작성</div>
          <table className="w-full text-left" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>업무보고일</th>
                <td><input className="ec-input" type="date" value={form.reportDate} onChange={(e) => set('reportDate', e.target.value)} style={{ width: 150 }} /> <span style={{ color: '#8a929c' }}>({dow(form.reportDate)})</span></td>
                <th style={{ width: 90, background: '#f5f7fa' }}>부서</th>
                <td><input className="ec-input" value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="미입력시 소속부서" style={{ width: 160 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>거래처</th>
                <td colSpan={3}><input className="ec-input" value={form.partnerName} onChange={(e) => set('partnerName', e.target.value)} style={{ width: 320 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>제목 *</th>
                <td colSpan={3}><input className="ec-input" value={form.title} onChange={(e) => set('title', e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa', verticalAlign: 'top' }}>내용 *</th>
                <td colSpan={3}><textarea value={form.content} onChange={(e) => set('content', e.target.value)} style={{ width: '100%', height: 120, border: '1px solid var(--ec-border)', padding: 8, fontSize: 13, resize: 'vertical', outline: 'none' }} /></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
            <button className="ec-btn" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>업무보고일 ▼</th>
              <th style={{ width: 44, textAlign: 'center' }}>요일</th>
              <th>부서</th>
              <th>거래처</th>
              <th>제목</th>
              <th>작성자</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작성된 업무일지가 없습니다.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.reportDate}</td>
                <td style={{ textAlign: 'center' }}>{dow(r.reportDate)}</td>
                <td>{r.department ?? ''}</td>
                <td>{r.partnerName ?? ''}</td>
                <td>{r.title}</td>
                <td>{r.authorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '입력닫기' : '신규(F2)'}</button>
        <button className="ec-btn">Excel</button>
      </div>
    </div>
  )
}
