import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../api/client'
import type { NotificationResponse, UserNote, WorkspaceSearch } from '../api/types'

export type PanelKind = 'search' | 'notifications' | 'notes'

const TITLE: Record<PanelKind, string> = {
  search: '통합검색',
  notifications: '알림',
  notes: 'E Note (개인 메모)',
}

/**
 * 우측 앱바에서 여는 슬라이드 패널.
 * 통합검색·알림은 조회 결과에서 바로 해당 화면으로 이동하고, E Note 는 개인 메모를 관리한다.
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
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{TITLE[kind]}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
          {kind === 'search' ? <SearchPanel onClose={onClose} />
            : kind === 'notifications' ? <NotificationPanel onClose={onClose} />
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          className="ec-input" value={q} autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
          placeholder="품목·거래처·전표번호로 검색" style={{ flex: 1 }}
        />
        <button className="ec-btn ec-btn-primary" onClick={run} disabled={loading}>{loading ? '검색 중…' : '검색'}</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {result && (
        <>
          <div style={{ fontSize: 12, color: '#8a929c', marginBottom: 8 }}>
            "{result.keyword}" 검색결과 {result.total}건
          </div>
          {result.total === 0 ? (
            <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20, fontSize: 12.5 }}>일치하는 항목이 없습니다.</p>
          ) : result.groups.map((g) => (
            <div key={g.type} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)', marginBottom: 4 }}>
                {g.typeName} <span style={{ color: '#8a929c', fontWeight: 400 }}>{g.total}건</span>
              </div>
              {g.hits.map((h, i) => (
                <div key={i} onClick={() => go(h.to)} style={{
                  padding: '7px 9px', border: '1px solid var(--ec-border)', borderRadius: 3,
                  marginBottom: 4, cursor: 'pointer', background: '#fff',
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ec-blue)' }}>{h.title}</div>
                  <div style={{ fontSize: 11.5, color: '#8a929c' }}>{h.subtitle}</div>
                </div>
              ))}
              {g.total > g.hits.length && (
                <div style={{ fontSize: 11.5, color: '#9aa1ab' }}>… 외 {g.total - g.hits.length}건 (화면에서 검색하세요)</div>
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

  if (error) return <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>
  if (!data) return <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20, fontSize: 12.5 }}>불러오는 중…</p>
  if (data.total === 0) {
    return <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20, fontSize: 12.5 }}>지금 처리할 알림이 없습니다.</p>
  }

  return (
    <>
      {data.notifications.map((n) => (
        <div key={n.type} onClick={() => { onClose(); navigate(n.to) }} style={{
          padding: '10px 12px', marginBottom: 8, cursor: 'pointer', borderRadius: 3,
          border: '1px solid ' + (n.level === 'WARN' ? '#f3d4d4' : '#cfe0f5'),
          background: n.level === 'WARN' ? '#fdf3f3' : '#f4f8fd',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: n.level === 'WARN' ? '#c60a2e' : 'var(--ec-blue-dark)' }}>
              {n.title}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#fff', borderRadius: 9, padding: '1px 7px',
              background: n.level === 'WARN' ? '#c60a2e' : 'var(--ec-blue)',
            }}>{n.count}</span>
          </div>
          <div style={{ fontSize: 12, color: '#5a626e', marginTop: 3 }}>{n.message}</div>
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className="ec-btn ec-btn-primary" onClick={add} disabled={saving}>{saving ? '저장 중…' : '메모 추가'}</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {notes.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20, fontSize: 12.5 }}>메모가 없습니다.</p>
      ) : notes.map((n) => (
        <div key={n.id} style={{
          padding: '9px 10px', marginBottom: 6, borderRadius: 3,
          border: '1px solid ' + (n.pinned ? '#f0d9a8' : 'var(--ec-border)'),
          background: n.pinned ? '#fffaf0' : '#fff',
        }}>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: '#2b3340' }}>{n.content}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: '#9aa1ab' }}>{n.updatedAt?.replace('T', ' ').slice(0, 16)}</span>
            <button className="ec-btn" style={{ height: 20, padding: '0 8px', marginLeft: 'auto' }} onClick={() => togglePin(n)}>
              {n.pinned ? '고정해제' : '고정'}
            </button>
            <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(n)}>삭제</button>
          </div>
        </div>
      ))}
    </>
  )
}
