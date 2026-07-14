import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BoardPost, BoardPostDetail } from '../../api/types'

const when = (s: string) => s.replace('T', ' ').slice(0, 16)

/**
 * 익명게시판 — 작성자를 가리고 올리는 글.
 * 서버에는 작성자가 남는다(본인만 지울 수 있어야 하고, 문제가 생기면 추적할 수 있어야 한다).
 * 가려지는 것은 화면과 API 응답이다. 화면에도 그렇게 적어둔다 — 안 남는 줄 알고 쓰면 곤란하다.
 */
export default function AnonymousBoardPage() {
  const [rows, setRows] = useState<BoardPost[]>([])
  const [detail, setDetail] = useState<BoardPostDetail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<BoardPost[]>('/board').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => { load() }, [])

  async function open(id: number) {
    try { setDetail((await api.get<BoardPostDetail>(`/board/${id}`)).data); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!window.confirm('이 글을 삭제할까요?')) return
    try { await api.delete(`/board/${id}`); flash('삭제했습니다.'); setDetail(null); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="익명게시판" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 글쓰기(F2)</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          익명 글은 작성자가 화면에 보이지 않습니다. 다만 <b>서버에는 작성자가 남습니다</b> — 본인 확인 없이 삭제할 수 없기 때문입니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 80 }}>분류</th>
            <th>제목</th>
            <th style={{ width: 110 }}>작성자</th>
            <th style={{ width: 70, textAlign: 'right' }}>조회</th>
            <th style={{ width: 130 }}>작성일시</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>글이 없습니다.</td></tr>
          ) : rows.map((p, i) => (
            <tr key={p.id} onClick={() => open(p.id)} style={{ cursor: 'pointer' }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ color: '#c07a00' }}>{p.category ?? ''}</td>
              <td>{p.title}</td>
              <td style={{ color: p.anonymous ? '#8a929c' : undefined }}>
                {p.author ?? ''}{p.anonymous && <span style={{ fontSize: 11, marginLeft: 4 }}>(익명)</span>}
              </td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{p.views}</td>
              <td style={{ color: '#8a929c' }}>{when(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
              <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{detail.title}</span>
              <span onClick={() => setDetail(null)} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#8a929c', marginBottom: 10 }}>
                <span style={{ color: '#c07a00', fontWeight: 700 }}>[{detail.category ?? '자유'}]</span>
                <span>{detail.author}</span>
                <span>{when(detail.createdAt)}</span>
                <span>조회 {detail.views}</span>
              </div>
              <div style={{ border: '1px solid var(--ec-border)', borderRadius: 3, padding: 12, minHeight: 140, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {detail.content || <span style={{ color: '#9aa1ab' }}>(내용 없음)</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
              <button className="ec-btn" style={{ color: '#c60a2e' }} onClick={() => remove(detail.id)}>삭제</button>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setDetail(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {showForm && <PostForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('글을 올렸습니다.'); load() }} />}
    </EcListShell>
  )
}

function PostForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('자유')
  const [content, setContent] = useState('')
  const [anonymous, setAnonymous] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!title.trim()) return setError('제목을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/board', { title, category, content: content || undefined, anonymous })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 620, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>글쓰기</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <select className="ec-input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 120 }}>
              <option value="자유">자유</option>
              <option value="건의">건의</option>
              <option value="질문">질문</option>
            </select>
            <input className="ec-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" style={{ flex: 1 }} />
          </div>
          <textarea className="ec-input" value={content} onChange={(e) => setContent(e.target.value)}
            style={{ width: '100%', height: 200, padding: 8, fontFamily: 'inherit' }} placeholder="내용" />
          <label style={{ display: 'block', marginTop: 8, fontSize: 12.5 }}>
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> 익명으로 올리기
            <span style={{ marginLeft: 6, color: '#8a929c' }}>— 화면에는 '익명'으로 보이지만 서버에는 작성자가 남습니다.</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '등록(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
