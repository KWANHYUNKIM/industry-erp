import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, NotificationResponse, Partner, ShortMessage, User, UserNote, WorkspaceSearch } from '../../types/api'
import { useAuth } from '../auth/AuthContext'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { Icon } from './icons'
import CodePickerField from '../../components/CodePickerField'
import EcIcon from '../../components/ui/EcIcon'

/*
 * 앱바 창 안쪽들 — 원본 2026-10-30 loginaa 캡처(같은 폴더 02~11)대로.
 * 창 틀(제목줄 · 고정 · 새로고침 · 닫기)은 AppWindow 가 그리고, 여기는 안만 그린다.
 */

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const slash = (ymd: string) => ymd.replace(/-/g, '/')
const when = (iso: string | null) => (iso ? `${slash(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '')

function useUsers() {
  const [users, setUsers] = useState<User[]>([])
  useEffect(() => { api.get<User[]>('/users').then((r) => setUsers(r.data.filter((u) => u.enabled))).catch(() => setUsers([])) }, [])
  return users
}

/* ── 02 업무지원AI ─────────────────────────────────────────────── */
export function AiWindow() {
  const [side, setSide] = useState<'custom' | 'ecount'>('custom')
  return (
    <div className="ec-ai">
      <div className="side">
        {/* 원본 왼쪽 줄(2026-10-30 다시 눌러 봄): 'AI요약요청 ▾' 묶음 아래 '· ECOUNT AI요약' */}
        <button type="button" className={side === 'custom' ? 'on' : ''} onClick={() => setSide('custom')}>AI요약요청 <EcIcon name="caret-down" size={10} glyph="▾" /></button>
        <button type="button" className={side === 'ecount' ? 'on' : ''} onClick={() => setSide('ecount')}>· ECOUNT AI요약</button>
      </div>
      <div className="main">
        {'우리 회사 게시판에 등록된 자료를 기반으로\nAI가 내용을 요약하고 답변을 제공합니다.\n\n대화를 시작할 그룹이나 대화방을 선택해 주세요.'}
      </div>
    </div>
  )
}

/* ── 03 통합검색 — 원본은 '도움말' 창이다(2026-10-30 loginaa 다시 눌러 봄: 머리 '도움말' · 큰 칸 · 알약 7 · [온라인 문의하기(F2)]) ──
 * 원본 알약은 도움말 분류다. 우리에게는 도움말 글이 없어 [통합검색] 알약만 우리 자료(메뉴 · 전표 · 게시글 · 품목 · 거래처)를 찾고,
 * 나머지 분류는 원본이 결과가 없을 때 보이는 안내를 그대로 낸다. */
const SEARCH_TABS: { label: string; types: string[] | null }[] = [
  { label: '통합검색', types: null },
  { label: '자주묻는질문 영상', types: [] },
  { label: '온라인매뉴얼', types: [] },
  { label: '동영상강좌', types: [] },
  { label: '거래처중심입력', types: [] },
  { label: '품목중심입력', types: [] },
  { label: '전표 바코드 검색', types: [] },
]
const RECENT_KEY = 'ec-recent-search'
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] } }
/* 원본 '검색결과가 없습니다.' 아래 안내 네 줄 */
const NO_RESULT_TIPS = [
  '단어의 철자가 정확한지 확인 바랍니다.',
  '한글을 영어로 혹은 영어를 한글로 입력했는지 확인합니다.',
  '검색어의 단어 수를 줄이거나, 보다 일반적인 검색어로 다시 검색합니다.',
  '두 단어 이상의 검색어인 경우, 띄어쓰기를 확인합니다.',
]

export function SearchWindow({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(0)
  const [result, setResult] = useState<WorkspaceSearch | null>(null)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [busy, setBusy] = useState(false)

  const saveRecent = (next: string[]) => { setRecent(next); localStorage.setItem(RECENT_KEY, JSON.stringify(next)) }
  const ask = () => void ecAlert('[온라인 문의하기] 는 이카운트 고객센터 서비스입니다.\n이 ERP 에서는 제공하지 않습니다.')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); ask() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function run(word = q) {
    const k = word.trim()
    setError('')
    if (!k) return setError('검색어를 입력하세요.')
    setQ(k)
    saveRecent([k, ...recent.filter((r) => r !== k)].slice(0, 10))
    setBusy(true)
    try {
      const { data } = await api.get<WorkspaceSearch>('/workspace/search', { params: { q: k } })
      setResult(data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const types = SEARCH_TABS[tab].types
  const groups = result ? result.groups.filter((g) => !types || types.includes(g.type)) : []
  /* 분류 알약은 원본처럼 누르면 바로 그 분류로 찾는다 — 우리에게 없는 분류라 늘 '결과 없음' */
  const searched = !!result || tab > 0
  return (
    <div className="ec-appwin-panel">
      <div className="ec-appwin-head"><span className="title">도움말</span></div>
      <div className="ec-big-search">
        <input value={q} autoFocus placeholder="궁금한 점이 있다면 도움말을 검색해보세요"
               onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />
        <button type="button" aria-label="검색" onClick={() => void run()}><Icon name="search" /></button>
      </div>
      <div className="ec-pills">
        {SEARCH_TABS.map((t, i) => (
          <button key={t.label} type="button" className={`ec-pill${i === tab ? ' active' : ''}`} onClick={() => setTab(i)}>{t.label}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger">{error}</p>}
      <div className="ec-appwin-scroll">
        {busy ? <p className="ec-appwin-empty">검색 중…</p> : !searched ? (
          recent.length > 0 && (
            <div className="flex flex-wrap gap-[4px]">
              <span className="ec-appwin-hint mr-[4px]">최근검색</span>
              {recent.map((r) => <button key={r} type="button" className="ec-tag-menu" onClick={() => void run(r)}>{r}</button>)}
            </div>
          )
        ) : groups.length === 0 || groups.every((g) => g.total === 0) ? (
          <div className="ec-search-none">
            <p className="font-bold mb-[6px]">검색결과가 없습니다.</p>
            <ul>{NO_RESULT_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        ) : groups.filter((g) => g.total > 0).map((g) => (
          <div key={g.type} className="ec-search-group">
            <div className="name">{g.typeName}<span>{g.total}건</span></div>
            {g.hits.map((h, i) => (
              <div key={i} className="ec-appwin-row" onClick={() => { onClose(); navigate(h.to) }}>
                <span className="ec-tag-menu">{g.typeName}</span>
                <span>{h.title}</span>
                <span className="sub">{h.subtitle}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="ec-appwin-foot">
        <button type="button" className="ec-btn ec-btn-primary" onClick={ask}>온라인 문의하기(F2)</button>
      </div>
    </div>
  )
}

/* ── 알림(목록 판 원본 미실측 — 말풍선만 실측) ─────────────────────── */
export function NotificationWindow({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [data, setData] = useState<NotificationResponse | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<NotificationResponse>('/workspace/notifications').then((r) => setData(r.data)).catch((err) => setError(extractErrorMessage(err)))
  }, [])
  return (
    <div className="ec-appwin-panel">
      <div className="ec-appwin-head"><span className="title">알림</span></div>
      {error && <p className="ec-alert ec-alert-danger">{error}</p>}
      <div className="ec-appwin-scroll">
        {!data ? <p className="ec-appwin-empty">불러오는 중…</p>
          : data.total === 0 ? <p className="ec-appwin-empty">새 알림이 없습니다.</p>
          : data.notifications.map((n) => (
            <div key={n.type} className={`ec-appwin-row${n.level === 'WARN' ? ' warn' : ''}`} onClick={() => { onClose(); navigate(n.to) }}>
              <span className="ec-tag-menu">{n.title}</span>
              <span>{n.message}</span>
              <span className="ec-msg-count">{n.count}</span>
            </div>
          ))}
      </div>
      <div className="ec-appwin-foot"><button type="button" className="ec-btn" onClick={onClose}>닫기</button></div>
    </div>
  )
}

/* ── 05 E Note ───────────────────────────────────────────────── */
export type NoteTab = 'todo' | 'memo' | 'files' | 'images'
const NOTE_TABS: { key: NoteTab; label: string }[] = [
  { key: 'todo', label: 'To Do' }, { key: 'memo', label: 'Memo' }, { key: 'files', label: '개인파일함' }, { key: 'images', label: '이미지파일함' },
]
const TODO_PILLS = ['전체', '예정', '해야할 일', '완료'] as const

export function NoteWindow({ initialTab = 'todo', onClose }: { initialTab?: NoteTab; onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const doneKey = `ec-enote-done:${user?.id ?? 0}`
  const [tab, setTab] = useState<NoteTab>(initialTab)
  const [pill, setPill] = useState<(typeof TODO_PILLS)[number]>('전체')
  const [notes, setNotes] = useState<UserNote[]>([])
  const [done, setDone] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(doneKey) ?? '[]') } catch { return [] } })
  const [picked, setPicked] = useState<number[]>([])
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [labelOpen, setLabelOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.get<UserNote[]>('/workspace/notes').then((r) => setNotes(r.data)).catch((err) => setError(extractErrorMessage(err)))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); setDraft('') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const saveDone = (next: number[]) => { setDone(next); localStorage.setItem(doneKey, JSON.stringify(next)) }
  const shown = notes.filter((n) => {
    if (q.trim() && !n.content.includes(q.trim())) return false
    if (tab !== 'todo') return true
    if (pill === '완료') return done.includes(n.id)
    if (pill === '해야할 일') return !done.includes(n.id)
    if (pill === '예정') return n.pinned && !done.includes(n.id)
    return true
  })

  async function add() {
    if (!draft?.trim()) return setError('내용을 입력하세요.')
    try { await api.post('/workspace/notes', { content: draft.trim() }); setDraft(null); setError(''); load() } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function remove() {
    if (!requireSelection(picked.length)) return
    if (!(await ecConfirm('선택한 자료를 삭제하시겠습니까?'))) return
    try { await Promise.all(picked.map((id) => api.delete(`/workspace/notes/${id}`))); setPicked([]); load() } catch (err) { setError(extractErrorMessage(err)) }
  }
  function complete() {
    if (!requireSelection(picked.length)) return
    saveDone([...new Set([...done, ...picked])])
    setPicked([])
  }
  async function relabel(pinned: boolean) {
    setLabelOpen(false)
    if (!requireSelection(picked.length)) return
    try {
      await Promise.all(notes.filter((n) => picked.includes(n.id)).map((n) => api.put(`/workspace/notes/${n.id}`, { content: n.content, pinned })))
      setPicked([]); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const fileTab = tab === 'files' || tab === 'images'
  return (
    <div className="ec-appwin-panel">
      <div className="ec-appwin-tabs">
        {NOTE_TABS.map((t) => <button key={t.key} type="button" className={t.key === tab ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {!fileTab && (
        <div className="ec-appwin-head">
          {tab === 'todo' ? (
            <div className="ec-pills mr-auto">
              {TODO_PILLS.map((p) => <button key={p} type="button" className={`ec-pill${p === pill ? ' active' : ''}`} onClick={() => setPill(p)}>{p}</button>)}
            </div>
          ) : <span className="title">Memo</span>}
          <input className="ec-input w-[160px]" placeholder="검색어" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {error && <p className="ec-alert ec-alert-danger">{error}</p>}
      {draft !== null && !fileTab && (
        <div className="flex gap-[6px]">
          <textarea className="ec-input flex-1 h-[52px]" autoFocus value={draft} placeholder={tab === 'todo' ? '할 일을 입력하세요.' : '메모를 입력하세요.'}
                    onChange={(e) => setDraft(e.target.value)} />
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void add()}>저장</button>
          <button type="button" className="ec-btn" onClick={() => setDraft(null)}>취소</button>
        </div>
      )}
      <div className="ec-appwin-scroll">
        {fileTab ? (
          <div className="ec-appwin-empty">
            {tab === 'files' ? '개인파일함' : '이미지파일함'}의 파일은 EC Drive 에 보관됩니다.
            <div className="mt-[10px]"><button type="button" className="ec-btn ec-btn-primary" onClick={() => { onClose(); navigate('/groupware/drive') }}>EC Drive 열기</button></div>
          </div>
        ) : shown.length === 0 ? <p className="ec-appwin-empty">등록된 데이터가 없습니다.</p>
          : shown.map((n) => (
            <label key={n.id} className={`ec-todo${done.includes(n.id) ? ' done' : ''}`}>
              <input type="checkbox" checked={picked.includes(n.id)} onChange={() => toggle(n.id)} />
              {n.pinned && <span className="ec-tag-menu notice">예정</span>}
              <span className="body">{n.content}</span>
              <span className="date">{when(n.updatedAt)}</span>
            </label>
          ))}
      </div>
      <div className="ec-appwin-foot">
        {!fileTab && (
          <>
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setDraft('')}>신규(F2)</button>
            {tab === 'todo' && <button type="button" className="ec-btn" onClick={complete}>완료</button>}
            <button type="button" className="ec-btn" onClick={() => void remove()}>선택삭제</button>
            <span className="relative">
              <button type="button" className="ec-btn" onClick={() => setLabelOpen((o) => !o)}>라벨변경 <EcIcon name="caret-down" size={10} glyph="▾" /></button>
              {labelOpen && (
                <span className="ec-appbar-sub block bottom-[30px] top-auto translate-y-0 left-0 right-auto">
                  <button type="button" onClick={() => void relabel(true)}>예정</button>
                  <button type="button" onClick={() => void relabel(false)}>라벨 없음</button>
                </span>
              )}
            </span>
            <button type="button" className="ec-btn" onClick={() => void ecAlert('카테고리는 아직 나눌 수 없습니다.\n라벨변경으로 [예정] 을 붙여 구분해 주세요.')}>카테고리 설정</button>
          </>
        )}
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

/* ── 07 쪽지 ─────────────────────────────────────────────────── */
type MsgTab = 'all' | 'received' | 'sent'
export function ShortMessageWindow({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const users = useUsers()
  const [tab, setTab] = useState<MsgTab>('received')
  const [box, setBox] = useState<'received' | 'unread' | 'read' | 'archived'>('received')
  const [rows, setRows] = useState<(ShortMessage & { mine: boolean })[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [keyword, setKeyword] = useState('')
  const [compose, setCompose] = useState<{ to: number | ''; content: string } | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const get = (b: string) => api.get<ShortMessage[]>('/short-messages', { params: { box: b, keyword: keyword.trim() || undefined } }).then((r) => r.data)
      const recv = tab === 'sent' ? [] : (await get(box)).map((m) => ({ ...m, mine: false }))
      const sent = tab === 'received' ? [] : (await get('sent')).map((m) => ({ ...m, mine: true }))
      setRows([...recv, ...sent].sort((a, b) => b.sentAt.localeCompare(a.sentAt)))
      setPicked([])
    } catch (err) { setError(extractErrorMessage(err)) }
  }, [tab, box, keyword])
  useEffect(() => { void load() }, [tab, box]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); setCompose({ to: '', content: '' }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const one = () => {
    if (!requireSelection(picked.length)) return null
    return rows.find((r) => r.id === picked[0]) ?? null
  }
  async function send() {
    if (!compose) return
    if (compose.to === '') return setError('받는 사람을 선택하세요.')
    if (!compose.content.trim()) return setError('내용을 입력하세요.')
    try {
      await api.post('/short-messages', { recipientIds: [compose.to], content: compose.content.trim() })
      setCompose(null)
      await ecAlert('쪽지를 보냈습니다.')
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function markRead() {
    if (!requireSelection(picked.length)) return
    try {
      await Promise.all(rows.filter((r) => picked.includes(r.id) && !r.mine && !r.readAt).map((r) => api.post(`/short-messages/${r.id}/read`)))
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function remove() {
    if (!requireSelection(picked.length)) return
    if (!(await ecConfirm('선택한 쪽지를 삭제하시겠습니까?'))) return
    try { await api.post('/short-messages/delete', { ids: picked }); void load() } catch (err) { setError(extractErrorMessage(err)) }
  }
  const who = tab === 'sent' ? '받은사람' : tab === 'received' ? '보낸사람' : '보낸/받은사람'
  const allOn = rows.length > 0 && picked.length === rows.length

  return (
    <div className="ec-appwin-panel">
      <div className="ec-appwin-head">
        <span className="title">쪽지</span>
        <input className="ec-input w-[140px]" placeholder="검색어(내용)" value={keyword}
               onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load() }} />
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>Search(F3)</button>
      </div>
      <div className="ec-appwin-head">
        <div className="ec-pills mr-auto">
          {([['all', '전체'], ['received', '받은쪽지'], ['sent', '보낸쪽지']] as const).map(([k, l]) => (
            <button key={k} type="button" className={`ec-pill${k === tab ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className={`ec-btn ec-btn-sm${box === 'archived' ? ' ec-btn-primary' : ''}`}
                onClick={() => { setTab('received'); setBox(box === 'archived' ? 'received' : 'archived') }}>스팸함</button>
        <select className="ec-input h-[22px]" value={box === 'archived' ? 'received' : box} onChange={(e) => { setTab('received'); setBox(e.target.value as typeof box) }}>
          <option value="received">받은쪽지</option>
          <option value="unread">미확인</option>
          <option value="read">확인</option>
        </select>
      </div>
      {error && <p className="ec-alert ec-alert-danger">{error}</p>}
      {compose && (
        <div className="flex gap-[6px] items-start">
          <CodePickerField label="받는사람" hideLabel width={150} emptyLabel="받는사람" value={compose.to === '' ? '' : String(compose.to)}
                           onChange={(v) => setCompose({ ...compose, to: v ? Number(v) : '' })}
                           items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name, sub: u.department }))} />
          <textarea className="ec-input flex-1 h-[52px]" autoFocus value={compose.content} placeholder="내용"
                    onChange={(e) => setCompose({ ...compose, content: e.target.value })} />
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void send()}>보내기</button>
          <button type="button" className="ec-btn" onClick={() => setCompose(null)}>취소</button>
        </div>
      )}
      <div className="ec-appwin-scroll">
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-[30px]"><input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? [] : rows.map((r) => r.id))} /></th>
              <th className="w-[120px]">보낸/받은 시간</th>
              <th>내용</th>
              <th className="w-[100px]">{who}</th>
              <th className="w-[60px]">상태</th>
              <th className="w-[110px]">연결전표</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={`${r.mine ? 's' : 'r'}${r.id}`}>
                <td className="text-center"><input type="checkbox" checked={picked.includes(r.id)} onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} /></td>
                <td>{when(r.sentAt)}</td>
                <td className="whitespace-pre-wrap">{r.content}</td>
                <td>{r.mine ? r.recipientName : r.senderName}</td>
                <td className="text-center">{r.statusName}</td>
                <td>{r.linkPath ? <button type="button" className="ec-link" onClick={() => { onClose(); navigate(r.linkPath!) }}>{r.linkRef ?? r.linkSource}</button> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ec-appwin-hint">※ 쪽지는 보낸 시점으로부터 1년 동안 보관되며, 이후 자동으로 삭제됩니다.</p>
      <div className="ec-appwin-foot">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => setCompose({ to: '', content: '' })}>신규(F2)</button>
        <button type="button" className="ec-btn" onClick={() => { const m = one(); if (m) setCompose({ to: m.mine ? m.recipientId : (m.senderId ?? ''), content: '' }) }}>답장</button>
        <button type="button" className="ec-btn" onClick={() => { const m = one(); if (m) setCompose({ to: '', content: `[전달] ${m.content}` }) }}>전달</button>
        <button type="button" className="ec-btn" onClick={() => void markRead()}>수신확인</button>
        <button type="button" className="ec-btn" onClick={() => void remove()}>선택삭제</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

/* ── 08 SMS — 발신번호를 등록하지 않으면 보내지 못한다(원본 경고띠 그대로, 실제 발송 없음) ─────── */
interface SmsTarget { name: string; phone: string }
export function SmsWindow({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targets, setTargets] = useState<SmsTarget[]>([])
  const [src, setSrc] = useState<'emp' | 'partner' | 'direct'>('emp')
  const [emps, setEmps] = useState<EmployeeMaster[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [q, setQ] = useState('')
  const [direct, setDirect] = useState({ name: '', phone: '' })

  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmps(r.data.filter((e) => e.active))).catch(() => setEmps([]))
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  const bytes = useMemo(() => [...body].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 2 : 1), 0), [body])
  const list: SmsTarget[] = (src === 'emp'
    ? emps.map((e) => ({ name: e.name, phone: e.mobile ?? e.phone ?? '' }))
    : src === 'partner' ? partners.map((p) => ({ name: p.name, phone: p.mobile ?? p.phone ?? '' })) : []
  ).filter((t) => !q.trim() || t.name.includes(q.trim()) || t.phone.includes(q.trim()))
  const add = (t: SmsTarget) => {
    if (!t.phone) return void ecAlert('수신번호가 없습니다.')
    setTargets((ts) => (ts.some((x) => x.phone === t.phone) ? ts : [...ts, t]))
  }

  return (
    <>
      <div className="ec-sms-warn">
        ※ 발신번호 등록 없이 발송 불가 안내
        <small>전기통신사업법에 따라 미리 등록한 발신번호로만 문자를 보낼 수 있습니다. 발신번호를 먼저 등록해 주십시오.</small>
      </div>
      <div className="ec-sms">
        <div className="ec-sms-phone">
          <input className="ec-input" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="ec-input" placeholder="내용을 입력하세요." value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="count">{bytes} / {bytes > 90 ? '2,000 byte (LMS)' : '90 byte (SMS)'}</div>
          <div className="ec-appwin-hint">받는사람 {targets.length}명</div>
          <table className="w-full">
            <thead><tr><th className="w-[24px]">No</th><th>이름</th><th>수신번호</th><th className="w-[20px]" /></tr></thead>
            <tbody>
              {targets.length === 0 ? <tr><td colSpan={4} className="text-center">오른쪽에서 고르세요.</td></tr>
                : targets.map((t, i) => (
                  <tr key={t.phone}>
                    <td className="text-center">{i + 1}</td><td>{t.name}</td><td>{t.phone}</td>
                    <td><button type="button" className="ec-link" aria-label="빼기" onClick={() => setTargets((ts) => ts.filter((x) => x !== t))}><EcIcon name="close" size={12} glyph="✕" /></button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="ec-sms-list">
          <div className="ec-appwin-head">
            <span className="title">수신번호 검색</span>
            <input className="ec-input w-[120px]" placeholder="이름 · 번호" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ec-pills">
            {([['emp', '사원'], ['partner', '거래처'], ['direct', '직접']] as const).map(([k, l]) => (
              <button key={k} type="button" className={`ec-pill${k === src ? ' active' : ''}`} onClick={() => setSrc(k)}>{l}</button>
            ))}
          </div>
          <div className="ec-appwin-scroll">
            {src === 'direct' ? (
              <div className="flex gap-[6px]">
                <input className="ec-input w-[100px]" placeholder="이름" value={direct.name} onChange={(e) => setDirect({ ...direct, name: e.target.value })} />
                <input className="ec-input flex-1" placeholder="수신번호" value={direct.phone} onChange={(e) => setDirect({ ...direct, phone: e.target.value })} />
                <button type="button" className="ec-btn" onClick={() => { add({ name: direct.name || direct.phone, phone: direct.phone.trim() }); setDirect({ name: '', phone: '' }) }}>추가</button>
              </div>
            ) : (
              <table className="w-full">
                <thead><tr><th className="w-[30px]" /><th>{src === 'emp' ? '사원명' : '거래처명'}</th><th>수신번호</th><th className="w-[50px]">수신</th></tr></thead>
                <tbody>
                  {list.length === 0 ? <tr><td colSpan={4} className="text-center">등록된 데이터가 없습니다.</td></tr>
                    : list.map((t, i) => (
                      <tr key={`${t.name}-${i}`}>
                        <td className="text-center">{i + 1}</td><td>{t.name}</td><td>{t.phone}</td>
                        <td className="text-center"><button type="button" className="ec-link" onClick={() => add(t)}>수신</button></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <div className="ec-appwin-foot">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void ecAlert('등록된 발신번호가 없어 보낼 수 없습니다.\n발신번호를 먼저 등록해 주십시오.')}>보내기</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </>
  )
}

/* ── 10 타임라인 ─────────────────────────────────────────────── */
export function TimelineWindow({ onClose }: { onClose: () => void }) {
  const [day, setDay] = useState(today())
  const [q, setQ] = useState('')
  const shift = (n: number) => {
    const d = new Date(`${day}T00:00:00`)
    d.setDate(d.getDate() + n)
    setDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return (
    <div className="ec-appwin-panel">
      <div className="ec-appwin-head">
        <span className="title">타임라인</span>
        <input className="ec-input w-[140px]" placeholder="검색어" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="ec-btn ec-btn-primary">Search(F3)</button>
      </div>
      <div className="flex items-center gap-[4px]">
        <button type="button" className="ec-btn ec-btn-sm" aria-label="전날" onClick={() => shift(-1)}>‹</button>
        <div className="ec-pills"><button type="button" className="ec-pill active">{slash(day)}</button></div>
        <button type="button" className="ec-btn ec-btn-sm" aria-label="다음날" onClick={() => shift(1)}>›</button>
      </div>
      <div className="ec-appwin-scroll">
        <div className="ec-appwin-row">등록된 데이터가 없습니다.</div>
      </div>
      <div className="ec-appwin-foot"><button type="button" className="ec-btn" onClick={onClose}>닫기</button></div>
    </div>
  )
}

/* ── 11 북마크 ───────────────────────────────────────────────── */
interface Bookmark { id: number | null; label: string; path: string; sortOrder: number }
export function BookmarkWindow({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Bookmark[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { api.get<Bookmark[]>('/bookmarks').then((r) => setRows(r.data)).catch(() => setRows([])) }, [])
  const shown = rows.filter((b) => !q.trim() || b.label.includes(q.trim()))
  return (
    <div className="ec-appwin-panel">
      <div className="ec-appwin-head">
        <span className="title">북마크</span>
        <input className="ec-input w-[140px]" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="ec-appwin-scroll">
        {shown.length === 0 ? <p className="ec-appwin-empty">등록된 데이터가 없습니다.</p>
          : shown.map((b) => (
            <div key={`${b.id}-${b.path}`} className="ec-appwin-row" onClick={() => { onClose(); navigate(b.path) }}>
              <span className="ec-tag-menu">{b.label}</span>
              <span className="ec-appwin-hint">{b.path}</span>
            </div>
          ))}
      </div>
      <div className="ec-appwin-foot"><button type="button" className="ec-btn" onClick={onClose}>닫기</button></div>
    </div>
  )
}
