import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

interface Notice {
  id: number
  title: string
  content: string | null
  category: string | null
  pinned: boolean
  views: number
  author: string | null
  createdAt: string | null
}

const fmtDate = (s: string | null) => (s ? s.slice(0, 10).replace(/-/g, '/') : '')

/** 그룹웨어 > 업무관리게시판 — 게시판 목록·작성·상세 (실제 연동, /notices) */
export default function BoardPage() {
  const [rows, setRows] = useState<Notice[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [detail, setDetail] = useState<Notice | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('자유')
  const [content, setContent] = useState('')

  async function load() {
    try { setRows((await api.get<Notice[]>('/notices')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function open(id: number) {
    try { setDetail((await api.post<Notice>(`/notices/${id}/view`)).data); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('제목을 입력하세요.')
    try {
      await api.post('/notices', { title, category, content: content || undefined })
      setTitle(''); setContent(''); setShowForm(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return
    try { await api.delete(`/notices/${id}`); setDetail(null); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => !keyword || r.title.includes(keyword))

  return (
    <EcListShell
      title="업무관리게시판"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={() => { setShowForm((v) => !v); setDetail(null) }}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {showForm && (
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ background: '#f5f7fa', fontWeight: 700, width: 74 }}>분류</th>
                <td>
                  <select className="ec-input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 120 }}>
                    {['공지', '자유', '자료'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa', fontWeight: 700 }}>제목 *</th>
                <td><input className="ec-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa', fontWeight: 700 }}>내용</th>
                <td><textarea className="ec-input" value={content} onChange={(e) => setContent(e.target.value)} style={{ width: '100%', height: 120, resize: 'vertical' }} /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}

      {detail && (
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #eef1f5', paddingBottom: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#c07a00', fontWeight: 700 }}>[{detail.category ?? '자유'}]</span>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{detail.title}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#6b7280' }}>
              <span>{detail.author}</span>
              <span style={{ fontFamily: 'monospace' }}>{fmtDate(detail.createdAt)}</span>
              <span>조회 {detail.views}</span>
              <button className="ec-btn" style={{ height: 22 }} onClick={() => setDetail(null)}>닫기</button>
              <button className="ec-btn" style={{ height: 22, color: '#c60a2e' }} onClick={() => remove(detail.id)}>삭제</button>
            </div>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, minHeight: 60 }}>{detail.content ?? ''}</div>
        </div>
      )}

      {error && !showForm && !detail && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 50, textAlign: 'center' }}>번호</th>
            <th style={{ width: 70 }}>분류</th>
            <th>제목</th>
            <th style={{ width: 100 }}>작성자</th>
            <th style={{ width: 120 }}>작성일</th>
            <th style={{ width: 70, textAlign: 'right' }}>조회</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>게시글이 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => open(r.id)}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{r.id}</td>
              <td style={{ color: '#c07a00' }}>{r.category ?? ''}</td>
              <td style={{ fontWeight: 600 }}>{r.title}</td>
              <td>{r.author ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{fmtDate(r.createdAt)}</td>
              <td style={{ textAlign: 'right' }}>{r.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
