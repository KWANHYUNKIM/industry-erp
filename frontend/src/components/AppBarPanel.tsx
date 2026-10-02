import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../api/client'
import type { NotificationResponse, UserNote, WorkspaceSearch } from '../types/api'
import MessengerPanel from './MessengerPanel'

export type PanelKind = 'search' | 'notifications' | 'notes' | 'messenger'

/**
 * 앱바 패널(메신저·알림 …)을 <b>화면 안에서</b> 연다.
 *
 * <p>패널은 EcountLayout 이 들고 있어 페이지가 손댈 수 없었다. 그런데 원본에는
 * 근태조회의 [메신저]·설문조사조회의 [대화방] 처럼 <b>그 화면에서 말을 거는</b> 버튼이 있다.
 * 창을 페이지마다 새로 만들면 앱바의 것과 둘이 되므로, <b>같은 창을 열어 달라고</b> 알린다.
 */
export function openAppBarPanel(kind: PanelKind) {
  window.dispatchEvent(new CustomEvent<PanelKind>('ec:open-panel', { detail: kind }))
}

const TITLE: Record<PanelKind, string> = {
  search: '통합검색',
  notifications: '알림',
  notes: 'E Note (개인 메모)',
  messenger: '메신저',
}

/**
 * 우측 앱바에서 여는 슬라이드 패널.
 * 통합검색·알림은 조회 결과에서 바로 해당 화면으로 이동하고, E Note 는 개인 메모를 관리한다.
 * 메신저는 스스로 목록/대화 영역을 나눠 쓰므로 공용 여백·스크롤을 두지 않는다.
 */
export default function AppBarPanel({ kind, onClose }: { kind: PanelKind; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.28)', zIndex: 200 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '92vw',
          background: '#fff', borderLeft: '1px solid var(--ec-border)',
          boxShadow: '-10px 0 30px rgba(20,36,68,0.18)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="flex items-center py-[12px] px-[14px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{TITLE[kind]}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div style={kind === 'messenger'
          ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
          : { flex: 1, overflow: 'auto', padding: 14 }}>
          {kind === 'search' ? <SearchPanel onClose={onClose} />
            : kind === 'notifications' ? <NotificationPanel onClose={onClose} />
            : kind === 'messenger' ? <MessengerPanel />
            : <NotePanel />}
        </div>
      </div>
    </div>
  )
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [result, setResult] = useState<WorkspaceSearch | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function run() {
    setError('')
    if (!q.trim()) return setError('검색어를 입력하세요.')
    setLoading(true)
    try {
      const { data } = await api.get<WorkspaceSearch>('/workspace/search', { params: { q } })
      setResult(data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function go(to: string) {
    onClose()
    navigate(to)
  }

  return (
    <>
      <div className="flex gap-[6px] mb-[10px]">
        <input
          className="ec-input" value={q} autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
          placeholder="품목·거래처·전표번호로 검색" style={{ flex: 1 }}
        />
        <button className="ec-btn ec-btn-primary" onClick={run} disabled={loading}>{loading ? '검색 중…' : '검색'}</button>
      </div>

      {error && <p className="ec-alert ec-alert-danger">{error}</p>}

      {result && (
        <>
          <div className="text-[12px] text-ec-hint mb-[8px]">
            "{result.keyword}" 검색결과 {result.total}건
          </div>
          {result.total === 0 ? (
            <p className="text-center text-ec-hint p-[20px] text-[12.5px]">일치하는 항목이 없습니다.</p>
          ) : result.groups.map((g) => (
            <div key={g.type} className="mb-[14px]">
              <div className="text-[12.5px] font-bold text-ec-navy mb-[4px]">
                {g.typeName} <span className="text-ec-hint font-normal">{g.total}건</span>
              </div>
              {g.hits.map((h, i) => (
                <div key={i} onClick={() => go(h.to)} className="py-[7px] px-[9px] border border-ec-line border-solid rounded-[3px] mb-[4px] cursor-pointer bg-white">
                  <div className="text-[12.5px] font-semibold text-ec-blue">{h.title}</div>
                  <div className="text-[11.5px] text-ec-hint">{h.subtitle}</div>
                </div>
              ))}
              {g.total > g.hits.length && (
                <div className="text-[11.5px] text-ec-hint">… 외 {g.total - g.hits.length}건 (화면에서 검색하세요)</div>
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [data, setData] = useState<NotificationResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<NotificationResponse>('/workspace/notifications')
      .then((r) => setData(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  if (error) return <p className="ec-alert ec-alert-danger">{error}</p>
  if (!data) return <p className="text-center text-ec-hint p-[20px] text-[12.5px]">불러오는 중…</p>
  if (data.total === 0) {
    return <p className="text-center text-ec-hint p-[20px] text-[12.5px]">지금 처리할 알림이 없습니다.</p>
  }

  return (
    <>
      {data.notifications.map((n) => (
        <div key={n.type} onClick={() => { onClose(); navigate(n.to) }} style={{
          padding: '10px 12px', marginBottom: 8, cursor: 'pointer', borderRadius: 3,
          border: '1px solid ' + (n.level === 'WARN' ? '#f3d4d4' : 'var(--ec-info-line)'),
          background: n.level === 'WARN' ? '#fdf3f3' : '#f4f8fd',
        }}>
          <div className="flex items-center gap-[6px]">
            <span style={{ fontSize: 12.5, fontWeight: 700, color: n.level === 'WARN' ? 'var(--ec-danger)' : 'var(--ec-blue-dark)' }}>
              {n.title}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#fff', borderRadius: 9, padding: '1px 7px',
              background: n.level === 'WARN' ? 'var(--ec-danger)' : 'var(--ec-blue)',
            }}>{n.count}</span>
          </div>
          <div className="text-[12px] text-ec-label mt-[3px]">{n.message}</div>
        </div>
      ))}
    </>
  )
}

function NotePanel() {
  const [notes, setNotes] = useState<UserNote[]>([])
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const { data } = await api.get<UserNote[]>('/workspace/notes')
      setNotes(data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  async function add() {
    setError('')
    if (!content.trim()) return setError('메모 내용을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/workspace/notes', { content })
      setContent('')
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function togglePin(n: UserNote) {
    try {
      await api.put(`/workspace/notes/${n.id}`, { content: n.content, pinned: !n.pinned })
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(n: UserNote) {
    if (!window.confirm('이 메모를 삭제할까요?')) return
    try {
      await api.delete(`/workspace/notes/${n.id}`)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <>
      <textarea
        className="ec-input" value={content} onChange={(e) => setContent(e.target.value)}
        placeholder="메모를 입력하세요. 본인만 볼 수 있습니다."
        style={{ width: '100%', height: 80, padding: 8, resize: 'vertical', marginBottom: 6 }}
      />
      <div className="flex gap-[6px] mb-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={add} disabled={saving}>{saving ? '저장 중…' : '메모 추가'}</button>
      </div>

      {error && <p className="ec-alert ec-alert-danger">{error}</p>}

      {notes.length === 0 ? (
        <p className="text-center text-ec-hint p-[20px] text-[12.5px]">메모가 없습니다.</p>
      ) : notes.map((n) => (
        <div key={n.id} style={{
          padding: '9px 10px', marginBottom: 6, borderRadius: 3,
          border: '1px solid ' + (n.pinned ? '#f0d9a8' : 'var(--ec-border)'),
          background: n.pinned ? '#fffaf0' : '#fff',
        }}>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: '#2b3340' }}>{n.content}</div>
          <div className="flex items-center gap-[6px] mt-[6px]">
            <span className="text-[11px] text-ec-hint">{n.updatedAt?.replace('T', ' ').slice(0, 16)}</span>
            <button className="ec-btn" style={{ height: 20, padding: '0 8px', marginLeft: 'auto' }} onClick={() => togglePin(n)}>
              {n.pinned ? '고정해제' : '고정'}
            </button>
            <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => remove(n)}>삭제</button>
          </div>
        </div>
      ))}
    </>
  )
}
