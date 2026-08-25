import { useEffect, useState } from 'react'
import { exportTableToXlsx } from '../../utils/excel'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { WorkPost } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'

const today = () => ymd(new Date())

/**
 * 게시판 목록 화면. 원본은 게시판을 여러 개 두고 게시글을 그 아래 다는데,
 * 화면 모양은 게시판마다 똑같다 — 업무관리 &gt; WORK 와 공유정보 &gt; 공지사항이 그렇다.
 * 게시글번호도 게시판을 가로질러 한 줄기여서 목록 번호에 구멍이 보인다.
 *
 * 그래서 한 컴포넌트가 board 만 바꿔 두 화면을 낸다(내결재관리·기안서통합관리와 같은 방식).
 */
export default function WorkPage({ board = 'WORK', title = 'WORK' }: { board?: 'WORK' | 'NOTICE'; title?: string } = {}) {
  const [rows, setRows] = useState<WorkPost[]>([])
  const [tab, setTab] = useState<'전체' | '진행중' | '완료'>('전체')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', forwardTo: '', postDate: today() })
  // 원본 하단의 [진행상태변경]·[선택삭제]는 고른 글에 한꺼번에 하는 동작이다.
  // 고르는 방식은 다른 목록과 같다 — 회색 행번호 칸을 누른다.
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<WorkPost[]>('/work-posts', { params: { board } })
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [board])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    if (!form.content.trim()) return setError('내용을 입력하세요.')
    try {
      await api.post('/work-posts', {
        board, title: form.title, content: form.content,
        forwardTo: form.forwardTo || undefined, postDate: form.postDate,
      })
      setForm({ title: '', content: '', forwardTo: '', postDate: today() })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggleSelect = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /** 원본 [진행상태변경] — 고른 글의 진행상태를 한꺼번에 바꾼다. */
  async function changeStatusSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return setError('상태를 바꿀 글을 고르세요. 행번호 칸을 누르면 선택됩니다.')
    const done = window.confirm(`${targets.length}건을 '완료'로 바꿀까요? (취소를 누르면 '진행중')`)
    for (const r of targets) {
      try {
        // enum 값은 IN_PROGRESS 다. 'ONGOING' 을 보내면 400 이 난다(직접 시험해서 잡았다).
        await api.patch(`/work-posts/${r.id}/status`, { status: done ? 'DONE' : 'IN_PROGRESS' })
      } catch (err) {
        setError(extractErrorMessage(err))
      }
    }
    setSelected(new Set())
    load()
  }

  /** 원본 [선택삭제] */
  async function deleteSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return setError('지울 글을 고르세요. 행번호 칸을 누르면 선택됩니다.')
    if (!window.confirm(`${targets.length}건을 삭제할까요?`)) return
    for (const r of targets) {
      try {
        await api.delete(`/work-posts/${r.id}`)
      } catch (err) {
        setError(extractErrorMessage(err))
      }
    }
    setSelected(new Set())
    load()
  }

  async function doExcel() {
    const table = document.querySelector('#work-list table') as HTMLTableElement | null
    if (!table) return setError('내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, 'WORK'))) setError('내보낼 자료가 없습니다.')
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
    .filter((r) => !keyword || r.title.includes(keyword) || (r.writerName ?? r.writer).includes(keyword))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>{title}</span>
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

      {/* 상태 필터는 원본에서 알약(pill)이다. 앞서 다른 화면들을 일괄로 바꿀 때 이 화면만 빠져 있었다. */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t}{t !== '전체' ? ` (${rows.filter((r) => r.statusName === t).length})` : ` (${rows.length})`}
          </button>
        ))}
      </div>

      <div id="work-list" style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              {/* 1열은 행머리 — 헤더는 전체선택, 본문은 회색 행번호(눌러서 선택). 다른 목록과 같은 규칙. */}
              <th
                style={{ width: 34, cursor: shown.length > 0 ? 'pointer' : 'default' }}
                title="전체 선택 / 해제"
                onClick={() => setSelected(
                  selected.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)),
                )}
              >
                {shown.length > 0 && selected.size === shown.length ? '☑' : ''}
              </th>
              {/* 원본 컬럼 순서: 일자-No. · 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 · 첨부 · 조회 */}
              <th style={{ width: 110, textAlign: 'center' }}>일자-No.</th>
              <th style={{ width: 90, textAlign: 'center' }}>게시글번호</th>
              <th>제목</th>
              <th style={{ width: 90 }}>작성자명</th>
              <th style={{ width: 120 }}>전달자</th>
              <th style={{ width: 90, textAlign: 'center' }}>진행상태</th>
              <th style={{ width: 60, textAlign: 'center' }}>첨부</th>
              <th style={{ width: 60, textAlign: 'center' }}>조회</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 업무가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td
                  style={{
                    textAlign: 'center',
                    background: selected.has(r.id) ? 'var(--ec-blue-light)' : '#f3f3f3',
                    color: selected.has(r.id) ? 'var(--ec-blue-dark)' : '#8a929c',
                    fontWeight: selected.has(r.id) ? 700 : 400,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                  title="눌러서 이 글을 고릅니다"
                  onClick={() => toggleSelect(r.id)}
                >
                  {i + 1}
                </td>
                {/* 원본은 '일자-No.' 한 칸에 「2026/07/06 -1」처럼 일자와 순번을 함께 쓴다 */}
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{r.postDate} -1</td>
                <td style={{ textAlign: 'center' }}>{r.postNo}</td>
                <td>{r.title}</td>
                <td>{r.writerName ?? r.writer}</td>
                <td>{r.forwardTo ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: r.status === 'DONE' ? '#1c7c3c' : 'var(--ec-blue)', fontWeight: 700 }}>{r.statusName}</span>
                </td>
                {/* 첨부는 아직 업무글에 붙일 수 없다 — 값이 없으면 원본도 빈 칸이다 */}
                <td style={{ textAlign: 'center', color: '#c8ced6' }} />
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => toggleStatus(r)}
                          title={r.status === 'DONE' ? '진행중으로 되돌립니다' : '완료로 바꿉니다'}>
                    {r.status === 'DONE' ? '재개' : '완료'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        {/*
          원본 하단: 신규(F2)·보내기·업무지원AI·진행상태변경·모두펼쳐보기·선택삭제·Excel·이력조회·웹자료올리기.
          받쳐 줄 기능이 있는 것만 둔다 — 보내기·업무지원AI·이력조회·웹자료올리기는 아직 없다.
        */}
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '입력닫기' : '신규(F2)'}</button>
        <button className="ec-btn" onClick={() => void changeStatusSelected()}>진행상태변경</button>
        <button className="ec-btn" onClick={() => void deleteSelected()}>선택삭제</button>
        <button className="ec-btn" onClick={() => void doExcel()}>Excel</button>
      </div>
    </div>
  )
}
