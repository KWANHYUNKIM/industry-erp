import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

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

const CATEGORIES = ['일반', '인사', '시스템', '긴급']
const CAT_COLOR: Record<string, string> = { 일반: '#5a626e', 인사: 'var(--ec-blue)', 시스템: '#1c7c3c', 긴급: '#c60a2e' }

/** 그룹웨어 > 공지사항 — 사내 공지 등록/조회 (실제 연동) */
export default function NoticePage() {
  const [rows, setRows] = useState<Notice[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('일반')
  const [pinned, setPinned] = useState(false)
  const [content, setContent] = useState('')

  async function load() {
    try {
      const r = await api.get<Notice[]>('/notices')
      setRows(r.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!title.trim()) return setError('제목을 입력하세요.')
    try {
      await api.post<Notice>('/notices', {
        title, content: content || undefined, category, pinned,
      })
      setOk('공지 등록 완료')
      setTitle(''); setContent(''); setPinned(false); setCategory('일반')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function togglePin(n: Notice) {
    try { await api.patch(`/notices/${n.id}`, { pinned: !n.pinned }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function openNotice(n: Notice) {
    try { await api.post(`/notices/${n.id}/view`) } catch { /* 조회수 실패는 무시 */ }
    alert(`[${n.title}]\n\n${n.content ?? '(내용 없음)'}`)
    load()
  }

  async function remove(n: Notice) {
    if (!confirm(`[${n.title}] 공지를 삭제하시겠습니까?`)) return
    try { await api.delete(`/notices/${n.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => !keyword || r.title.includes(keyword) || (r.author ?? '').includes(keyword))
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="공지사항"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '공지등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">사내 공지 등록·조회 · 상단고정(📌) 우선 정렬 · 제목 클릭 시 내용 확인(조회수 증가)</p>

      <Modal open={showForm} title="공지사항 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>제목 *</th>
                <td colSpan={3}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} placeholder="공지 제목을 입력하세요" /></td>
              </tr>
              <tr>
                <th style={th}>분류</th>
                <td>
                  <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 150 }}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <th style={th}>상단고정</th>
                <td><label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 상단에 고정</label></td>
              </tr>
              <tr>
                <th style={th}>내용</th>
                <td colSpan={3}><textarea className={inputCls} value={content} onChange={(e) => setContent(e.target.value)} style={{ width: '100%', height: 70, resize: 'vertical' }} /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 44, textAlign: 'center' }}>고정</th>
            <th style={{ width: 80, textAlign: 'center' }}>분류</th>
            <th>제목 ▼</th>
            <th style={{ width: 90 }}>작성자</th>
            <th style={{ width: 100 }}>등록일</th>
            <th style={{ width: 70, textAlign: 'right' }}>조회수</th>
            <th style={{ width: 120, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>공지사항이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id} style={{ background: r.pinned ? '#fffdf2' : undefined }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => togglePin(r)} title="클릭하여 고정 전환">{r.pinned ? '📌' : '·'}</td>
              <td style={{ textAlign: 'center', color: CAT_COLOR[r.category ?? '일반'] ?? '#5a626e', fontWeight: 700 }}>{r.category ?? '일반'}</td>
              <td style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--ec-blue-dark)' }} onClick={() => openNotice(r)} title="클릭하여 내용 확인">{r.title}</td>
              <td>{r.author ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.createdAt ? r.createdAt.slice(0, 10) : ''}</td>
              <td style={{ textAlign: 'right' }}>{r.views.toLocaleString()}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => togglePin(r)}>{r.pinned ? '고정해제' : '고정'}</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', marginLeft: 4, color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
