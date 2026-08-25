import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BoardPost } from '../../api/types'

const when = (s: string) => s.replace('T', ' ').slice(0, 16)

/**
 * 그룹웨어 > 공유정보 > 익명게시판 (이카운트 E070252)
 *
 * 원본은 게시판이 아니라 <b>글상자 하나짜리 벽</b>이다. 제목·분류·작성자·조회수 칸이 없고,
 * 720×194 글상자에 쓰고 [저장(F8)] 을 누르면 아래 목록에 쌓인다. 상단에는 [도움말]뿐이고
 * 검색창도 Option 도 하단 버튼줄도 없다.
 *
 * 우리는 여기에 분류·제목·작성자·조회 컬럼을 가진 게시판을 놓고 글쓰기 팝업까지 띄우고 있었다.
 * 익명으로 한마디 남기는 자리에 제목을 강제하면 아무도 안 쓴다.
 *
 * 익명이라도 서버에는 작성자가 남는다 — 본인만 지울 수 있어야 하고, 문제가 생기면 추적할 수
 * 있어야 한다. 가려지는 것은 화면과 API 응답이다. 그 사실을 화면에도 적어 둔다.
 */
export default function AnonymousBoardPage() {
  const [rows, setRows] = useState<BoardPost[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    setError('')
    api.get<BoardPost[]>('/board').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  async function save() {
    setError('')
    if (!text.trim()) return setError('내용을 입력하세요.')
    setSaving(true)
    try {
      // 제목 칸이 없는 화면이므로 제목을 보내지 않는다. 서버가 첫 줄을 제목으로 쓴다.
      await api.post('/board', { content: text, anonymous: true })
      setText('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }

  async function remove(id: number) {
    if (!window.confirm('이 글을 삭제할까요?')) return
    try { await api.delete(`/board/${id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="익명게시판" searchable={false} option={false}>
      {/* 원본 실측: 글상자 720×194, [저장(F8)] 66×28 이 바로 아래, 전체가 왼쪽 정렬 720 폭 */}
      <div style={{ width: 720, maxWidth: '100%' }}>
        <textarea
          className="ec-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: '100%', height: 194, padding: 8, fontFamily: 'inherit', lineHeight: 1.6 }}
        />
        <div style={{ marginTop: 5 }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '저장(F8)'}
          </button>
          <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--ec-label)' }}>
            화면에는 작성자가 보이지 않지만 <b>서버에는 남습니다</b> — 본인 확인 없이 지울 수 없기 때문입니다.
          </span>
        </div>

        {error && <p style={{ marginTop: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

        {/* 목록. 원본은 머리글 줄 없이 글만 쌓인다. */}
        <table className="w-full text-left" style={{ marginTop: 14 }}>
          <tbody>
            {rows.length === 0 ? (
              <tr><td style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((p) => (
              <tr key={p.id}>
                <td style={{ whiteSpace: 'pre-wrap' }}>{p.content || p.title}</td>
                <td style={{ width: 120, textAlign: 'right', color: 'var(--ec-label)', whiteSpace: 'nowrap' }}>
                  {when(p.createdAt)}
                </td>
                <td style={{ width: 50, textAlign: 'center' }}>
                  <button className="ec-btn ec-btn-sm" style={{ color: '#c60a2e' }} onClick={() => remove(p.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
