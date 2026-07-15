import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { WorkPost } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)

/** 그룹웨어 > 업무관리 > WORK — 업무 게시글 목록 (실연동) */
export default function WorkPage() {
  const [rows, setRows] = useState<WorkPost[]>([])
  const [tab, setTab] = useState<'전체' | '진행중' | '완료'>('전체')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', forwardTo: '', postDate: today() })

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<WorkPost[]>('/work-posts')
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
      await api.post('/work-posts', {
        title: form.title, content: form.content,
        forwardTo: form.forwardTo || undefined, postDate: form.postDate,
      })
      setForm({ title: '', content: '', forwardTo: '', postDate: today() })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function toggleStatus(p: WorkPost) {
    try {
      await api.patch(`/work-posts/${p.id}/status`, {})
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows
    .filter((r) => tab === '전체' || r.statusName === tab)
    .filter((r) => !keyword || r.title.includes(keyword) || r.writer.includes(keyword))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>WORK</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <input className="ec-input" placeholder="입력 후 [Enter]" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 150 }} />
          <button className="ec-btn ec-btn-primary" onClick={load}>Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="신규 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>업무 등록</div>
          <table className="w-full text-left" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <th style={{ width: 80, background: '#f5f7fa' }}>제목 *</th>
                <td><input className="ec-input" value={form.title} onChange={(e) => set('title', e.target.value)} style={{ width: '100%' }} /></td>
                <th style={{ width: 80, background: '#f5f7fa' }}>전달자</th>
                <td><input className="ec-input" value={form.forwardTo} onChange={(e) => set('forwardTo', e.target.value)} placeholder="공유대상" style={{ width: 160 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa', verticalAlign: 'top' }}>내용 *</th>
                <td colSpan={3}><textarea value={form.content} onChange={(e) => set('content', e.target.value)} style={{ width: '100%', height: 100, border: '1px solid var(--ec-border)', padding: 8, fontSize: 13, resize: 'vertical', outline: 'none' }} /></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
            <button className="ec-btn" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}</Modal>

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t}{t !== '전체' ? ` (${rows.filter((r) => r.statusName === t).length})` : ` (${rows.length})`}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 90, textAlign: 'center' }}>게시글번호</th>
              <th style={{ width: 100 }}>일자</th>
              <th>제목</th>
              <th style={{ width: 90 }}>작성자명</th>
              <th style={{ width: 120 }}>전달자</th>
              <th style={{ width: 90, textAlign: 'center' }}>진행상태</th>
              <th style={{ width: 80, textAlign: 'center' }}>처리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 업무가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ textAlign: 'center' }}>{r.postNo}</td>
                <td>{r.postDate}</td>
                <td>{r.title}</td>
                <td>{r.writer}</td>
                <td>{r.forwardTo ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: r.status === 'DONE' ? '#1c7c3c' : 'var(--ec-blue)', fontWeight: 700 }}>{r.statusName}</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => toggleStatus(r)}>
                    {r.status === 'DONE' ? '재개' : '완료'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '입력닫기' : '신규(F2)'}</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
      </div>
    </div>
  )
}
