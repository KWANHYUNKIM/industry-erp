import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/** 그룹웨어 > 공유정보 — 사내 공지/자료 공유 게시판 (실제 연동, /notices 재사용) */
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

/** 공유정보 화면에서 다루는 기본 분류 — 그 외 분류(자유/자료 등)는 고정글만 노출해 게시판과 목록을 구분 */
const DEFAULT_CATEGORIES = ['공지', '규정', '서식', '일반']
const CAT_KEY = 'sharedinfo-categories-v1'

/** 기본 분류 + 사용자가 추가한 분류(브라우저 저장)를 합쳐 돌려준다 */
function loadCategories(): string[] {
  try {
    const extra = JSON.parse(localStorage.getItem(CAT_KEY) ?? '[]') as string[]
    return [...DEFAULT_CATEGORIES, ...extra.filter((c) => !DEFAULT_CATEGORIES.includes(c))]
  } catch {
    return [...DEFAULT_CATEGORIES]
  }
}

const catColor = (c: string | null) =>
  ({ 공지: '#c60a2e', 규정: '#7a5cc0', 서식: '#1c7c3c', 일반: '#5a626e' } as Record<string, string>)[c ?? ''] ?? '#5a626e'

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '')

export default function SharedInfoPage() {
  const [rows, setRows] = useState<Notice[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('일반')
  const [pinned, setPinned] = useState(false)
  const [categories, setCategories] = useState<string[]>(loadCategories)
  const [catOpen, setCatOpen] = useState(false)   // 분류 관리 모달
  const [newCat, setNewCat] = useState('')

  // 사용자 추가 분류만 localStorage에 저장 (기본 분류는 제외)
  function persistCats(next: string[]) {
    setCategories(next)
    localStorage.setItem(CAT_KEY, JSON.stringify(next.filter((c) => !DEFAULT_CATEGORIES.includes(c))))
  }
  function addCat() {
    const c = newCat.trim()
    if (!c) return
    if (categories.includes(c)) { setNewCat(''); return }
    persistCats([...categories, c])
    setNewCat('')
  }
  function removeCat(c: string) {
    if (DEFAULT_CATEGORIES.includes(c)) return  // 기본 분류는 삭제 불가
    persistCats(categories.filter((x) => x !== c))
    if (category === c) setCategory('일반')
  }

  async function load() {
    try { setRows((await api.get<Notice[]>('/notices')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function open(r: Notice) {
    try {
      const { data } = await api.post<Notice>(`/notices/${r.id}/view`)
      alert(`[${data.category ?? '일반'}] ${data.title}\n작성자: ${data.author ?? '-'} · 조회 ${data.views}\n\n${data.content ?? '(내용 없음)'}`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('제목을 입력하세요.')
    try {
      await api.post('/notices', { title, category, pinned })
      setTitle(''); setPinned(false); setShowForm(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = rows
    .filter((r) => r.pinned || categories.includes(r.category ?? ''))
    .filter((r) => !keyword || r.title.includes(keyword) || (r.author ?? '').includes(keyword))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <EcListShell
      title="공유정보"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => setShowForm(true)}
      newLabel={showForm ? '입력닫기' : '글쓰기(F2)'}
      actions={[{ label: '새로고침', onClick: load }, { label: '분류 관리', onClick: () => setCatOpen(true) }]}
    >
      <Modal open={showForm} title="공유정보 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ background: '#f5f7fa', fontWeight: 700, width: 74 }}>분류</th>
                <td>
                  <select className="ec-input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 120 }}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <th style={{ background: '#f5f7fa', fontWeight: 700, width: 74 }}>상단고정</th>
                <td>
                  <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 고정(📌)
                  </label>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa', fontWeight: 700 }}>제목 *</th>
                <td colSpan={3}><input className="ec-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 70, textAlign: 'center' }}>분류 ▼</th>
            <th>제목 ▼</th>
            <th style={{ width: 100 }}>작성자</th>
            <th style={{ width: 100 }}>작성일 ▼</th>
            <th style={{ width: 70, textAlign: 'right' }}>조회</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>게시글이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{r.pinned ? '📌' : i + 1}</td>
              <td style={{ textAlign: 'center', color: catColor(r.category), fontWeight: 700 }}>{r.category ?? '일반'}</td>
              <td style={{ fontWeight: r.pinned ? 700 : 400 }}>
                <a style={{ color: 'var(--ec-blue)', cursor: 'pointer' }} onClick={() => open(r)}>{r.title}</a>
              </td>
              <td>{r.author ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{fmtDate(r.createdAt)}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.views.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {catOpen && (
        <div onClick={() => setCatOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 480, maxWidth: '92vw', maxHeight: '84vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>분류 관리</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setCatOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px', color: '#5a626e' }}>글쓰기에서 선택하는 분류를 관리합니다. 기본 분류는 삭제할 수 없으며, 추가한 분류는 이 브라우저에 저장됩니다.</p>
              <table className="w-full text-left">
                <thead><tr><th>분류</th><th style={{ width: 80, textAlign: 'right' }}>게시글</th><th style={{ width: 70, textAlign: 'center' }}>관리</th></tr></thead>
                <tbody>
                  {categories.map((c) => {
                    const cnt = rows.filter((r) => (r.category ?? '') === c).length
                    const isDefault = DEFAULT_CATEGORIES.includes(c)
                    return (
                      <tr key={c}>
                        <td style={{ color: catColor(c), fontWeight: 700 }}>{c} {isDefault && <span style={{ color: '#9aa1ab', fontWeight: 400, fontSize: 11 }}>기본</span>}</td>
                        <td style={{ textAlign: 'right' }}>{cnt.toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isDefault
                            ? <span style={{ color: '#c0c5cc', fontSize: 11.5 }}>-</span>
                            : <button onClick={() => removeCat(c)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                <input className="ec-input" placeholder="새 분류명" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCat() }} style={{ flex: 1 }} />
                <button className="ec-btn ec-btn-primary" onClick={addCat}>추가</button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#c07a00' }}>* 분류의 서버 저장/공유는 백엔드 미연동입니다. 추가한 분류는 이 브라우저에서만 유지됩니다.</p>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
