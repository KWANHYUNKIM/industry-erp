import { Fragment, useEffect, useState } from 'react'
import { exportTableToXlsx } from '../../utils/excel'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { WorkPost } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'
import { useShortcut } from '../../utils/useShortcut'
import { downloadStoredFile, formatBytes } from '../../utils/fileDownload'
import EcFileDrop from '../../components/EcFileDrop'

const today = () => ymd(new Date())

/**
 * 게시판 목록 화면. 원본은 게시판을 여러 개 두고 게시글을 그 아래 다는데,
 * 화면 모양은 게시판마다 똑같다 — 업무관리 &gt; WORK 와 공유정보 &gt; 공지사항이 그렇다.
 * 게시글번호도 게시판을 가로질러 한 줄기여서 목록 번호에 구멍이 보인다.
 *
 * 그래서 한 컴포넌트가 board 만 바꿔 두 화면을 낸다(내결재관리·기안서통합관리와 같은 방식).
 *
 * <p><b>글을 읽을 수가 없었다.</b> 목록에 제목만 있고 펼치거나 여는 자리가 없어,
 * 올린 내용을 이 화면에서 볼 방법이 아예 없었다. 게시판인데 읽기가 안 되는 셈이다.
 * 원본은 제목을 누르면 그 자리에서 펼쳐지고, 하단 [모두펼쳐보기]로 전부 편다.
 * 펼친 글 아래에는 답글(F8)·복사·<b>수정</b>·<b>삭제</b>·닫기가 붙는다.
 *
 * <p>답글·복사·인쇄는 받쳐 줄 것이 없어 만들지 않는다 — 눌러도 아무 일 없는 버튼은
 * 있는 것만 못하다.
 *
 * <p>격자의 <b>[첨부]·[조회]</b> 두 열은 만들어 두고 채우지 못하고 있었다. 첨부 칸은 늘
 * 비어 있었고(붙일 자리가 없었다), 조회 칸에는 완료/재개 버튼이 들어가 있어 <b>열 이름과
 * 내용이 어긋나</b> 있었다. 이제 첨부는 실제 파일이고, 조회는 글을 편 횟수다.
 * 완료/재개는 원본대로 하단 [진행상태변경]으로 옮겼다.
 */
export default function WorkPage({ board = 'WORK', title = 'WORK' }: { board?: 'WORK' | 'NOTICE'; title?: string } = {}) {
  const [rows, setRows] = useState<WorkPost[]>([])
  const [tab, setTab] = useState<'전체' | '진행중' | '완료'>('전체')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', forwardTo: '', ccTo: '', postDate: today() })
  /** 원본 WORK입력 폼의 [공지사항여부]. 켜면 목록 맨 위에 붙는다. */
  const [notice, setNotice] = useState(false)
  /** 새 글에 붙일 파일. 원본 [웹자료올리기]·[여기에 파일 놓기]. */
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  // 원본 하단의 [진행상태변경]·[선택삭제]는 고른 글에 한꺼번에 하는 동작이다.
  // 고르는 방식은 다른 목록과 같다 — 회색 행번호 칸을 누른다.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  /** 펼쳐 놓은 글. 원본 [모두펼쳐보기]는 이걸 전부 채운다. */
  const [opened, setOpened] = useState<Set<number>>(new Set())
  /** 고치는 중인 글. 원본 펼친 글의 [수정]. */
  const [editing, setEditing] = useState<{ id: number; title: string; content: string; forwardTo: string; ccTo: string; notice: boolean } | null>(null)

  // Search(F3) — 버튼 라벨이 약속한 단축키
  useShortcut('F3', load)

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

  /**
   * 글을 편다. <b>펼 때만</b> 조회수를 올린다 — 목록을 부르는 것만으로 올리면
   * 화면을 열 때마다 모든 글이 같이 올라가서 그 숫자가 '몇 명이 봤나' 를 뜻하지 않게 된다.
   * 접을 때는 올리지 않는다.
   */
  const toggleOpen = (id: number) => {
    const willOpen = !opened.has(id)
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    if (!willOpen) return
    api.post<WorkPost>(`/work-posts/${id}/read`)
      .then((r) => setRows((prev) => prev.map((x) => (x.id === id ? r.data : x))))
      .catch(() => { /* 조회수는 곁다리다 — 실패해도 글은 펴진다. */ })
  }

  async function saveEdit() {
    if (!editing) return
    if (!editing.title.trim()) return setError('제목을 입력하세요.')
    if (!editing.content.trim()) return setError('내용을 입력하세요.')
    setError('')
    try {
      await api.put(`/work-posts/${editing.id}`, {
        title: editing.title, content: editing.content,
        forwardTo: editing.forwardTo || null,
        ccTo: editing.ccTo || null,
        notice: editing.notice,
      })
      setEditing(null)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function removeOne(id: number) {
    if (!confirm('이 글을 삭제할까요?')) return
    try {
      await api.delete(`/work-posts/${id}`)
      setOpened((prev) => { const n = new Set(prev); n.delete(id); return n })
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  /** 파일을 먼저 올려 id 를 받고, 글을 저장할 때 그 id 를 붙인다(기안서와 같은 방식). */
  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setAttachment({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    if (!form.content.trim()) return setError('내용을 입력하세요.')
    try {
      await api.post('/work-posts', {
        board, title: form.title, content: form.content,
        forwardTo: form.forwardTo || undefined, ccTo: form.ccTo || undefined,
        notice, postDate: form.postDate,
        attachmentId: attachment ? attachment.id : null,
      })
      setForm({ title: '', content: '', forwardTo: '', ccTo: '', postDate: today() })
      setNotice(false)
      setAttachment(null)
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
                <th style={{ width: 80, background: '#f5f7fa' }}>참조자</th>
                <td><input className="ec-input" value={form.ccTo} onChange={(e) => set('ccTo', e.target.value)} placeholder="참조대상" style={{ width: '100%' }} /></td>
                {/* 원본 WORK입력 폼의 [공지사항여부]. 켜면 목록 맨 위에 붙는다. */}
                <th style={{ width: 80, background: '#f5f7fa' }}>공지사항여부</th>
                <td>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} />
                    맨 위에 고정
                  </label>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa', verticalAlign: 'top' }}>내용 *</th>
                <td colSpan={3}><textarea value={form.content} onChange={(e) => set('content', e.target.value)} style={{ width: '100%', height: 100, border: '1px solid var(--ec-border)', padding: 8, fontSize: 13, resize: 'vertical', outline: 'none' }} /></td>
              </tr>
            </tbody>
          </table>
          {/* 원본 [웹자료올리기]·[여기에 파일 놓기]. 한 건만 붙는 자리다. */}
          <div style={{ marginBottom: 10 }}>
            <EcFileDrop busy={uploading} disabled={uploading}
                        onFiles={(fs) => { if (fs[0]) void upload(fs[0]) }}>
              {attachment && (
                <span style={{ fontSize: 12, color: 'var(--ec-blue-dark)' }}>
                  {attachment.name}
                  <span onClick={() => setAttachment(null)}
                        style={{ cursor: 'pointer', marginLeft: 6, fontWeight: 700 }}>×</span>
                </span>
              )}
            </EcFileDrop>
          </div>

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
              <Fragment key={r.id}>
              <tr>
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
                <td>
                  <button type="button" className="no-ec" onClick={() => toggleOpen(r.id)}
                          title="눌러서 내용을 폅니다"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                   font: 'inherit', color: 'var(--ec-blue-dark)', textAlign: 'left' }}>
                    <span style={{ color: '#9aa1ab', marginRight: 4 }}>{opened.has(r.id) ? '▾' : '▸'}</span>
                    {r.notice && (
                      <span style={{ color: '#c60a2e', fontWeight: 800, marginRight: 4 }}>[공지]</span>
                    )}
                    {r.title}
                  </button>
                </td>
                <td>{r.writerName ?? r.writer}</td>
                <td>{r.forwardTo ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: r.status === 'DONE' ? '#1c7c3c' : 'var(--ec-blue)', fontWeight: 700 }}>{r.statusName}</span>
                  {/* 원본 WORK입력 폼의 [완료일시]. 언제 끝난 일인지가 아무 데도 안 남아 있었다. */}
                  {r.completedAt && (
                    <div style={{ color: '#9aa1ab', fontSize: 11 }}>{r.completedAt.slice(0, 16).replace('T', ' ')}</div>
                  )}
                </td>
                {/* 원본 [첨부]. 파일이 없으면 원본도 빈 칸이다. */}
                <td style={{ textAlign: 'center' }}>
                  {r.attachmentId ? (
                    <span title={`${r.attachmentName} (${formatBytes(r.attachmentSize ?? 0)})`}
                          onClick={() => void downloadStoredFile(r.attachmentId!, r.attachmentName ?? '첨부')}
                          style={{ cursor: 'pointer', color: 'var(--ec-blue)' }}>📎</span>
                  ) : <span style={{ color: '#c8ced6' }}>—</span>}
                </td>
                {/* 원본 [조회] — 글을 편 횟수다. 완료/재개는 하단 [진행상태변경]으로 옮겼다. */}
                <td style={{ textAlign: 'center', color: '#5a626e' }}>{r.viewCount ?? 0}</td>
              </tr>
              {opened.has(r.id) && (
                <tr>
                  <td colSpan={9} style={{ background: '#fafbfd', padding: '10px 14px' }}>
                    {editing?.id === r.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input className="ec-input" value={editing.title}
                               onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                        <input className="ec-input" value={editing.forwardTo} placeholder="전달자"
                               onChange={(e) => setEditing({ ...editing, forwardTo: e.target.value })} />
                        <input className="ec-input" value={editing.ccTo} placeholder="참조자"
                               onChange={(e) => setEditing({ ...editing, ccTo: e.target.value })} />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                          <input type="checkbox" checked={editing.notice}
                                 onChange={(e) => setEditing({ ...editing, notice: e.target.checked })} />
                          공지사항여부
                        </label>
                        <textarea className="ec-input" rows={5} value={editing.content}
                                  onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="ec-btn ec-btn-primary" onClick={() => void saveEdit()}>저장</button>
                          <button className="ec-btn" onClick={() => setEditing(null)}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: '#3c4553', minHeight: 20 }}>
                          {r.content}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingTop: 6, borderTop: '1px solid #eef1f5' }}>
                          <button className="ec-btn" onClick={() => setEditing({
                            id: r.id, title: r.title, content: r.content, forwardTo: r.forwardTo ?? '',
                            ccTo: r.ccTo ?? '', notice: r.notice,
                          })}>수정</button>
                          <button className="ec-btn" onClick={() => void removeOne(r.id)}>삭제</button>
                          <button className="ec-btn" onClick={() => toggleOpen(r.id)}>닫기</button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        {/*
          원본 하단: 신규(F2)·보내기·업무지원AI·진행상태변경·모두펼쳐보기·선택삭제·Excel·이력조회·웹자료올리기.
          받쳐 줄 기능이 있는 것만 둔다 — 보내기·업무지원AI·이력조회는 아직 없다.
          [모두펼쳐보기]는 이제 있다 — 내용을 읽을 자리가 그것뿐이었다.
          [웹자료올리기]도 이제 있다 — 등록 폼의 첨부 자리가 그것이다.
        */}
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '입력닫기' : '신규(F2)'}</button>
        <button className="ec-btn" onClick={() => void changeStatusSelected()}>진행상태변경</button>
        <button className="ec-btn" onClick={() => setOpened(
          opened.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)),
        )}>
          {opened.size === shown.length && shown.length > 0 ? '모두접기' : '모두펼쳐보기'}
        </button>
        <button className="ec-btn" onClick={() => void deleteSelected()}>선택삭제</button>
        <button className="ec-btn" onClick={() => void doExcel()}>Excel</button>
      </div>
    </div>
  )
}
