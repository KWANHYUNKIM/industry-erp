import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BoardPost } from '../../types/api'
import { useShortcut } from '../../utils/useShortcut'

/** 원본 글 아래 시각 — '2024/10/22 오전 8:57:23'. */
const when = (s: string) => {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  const h = d.getHours()
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

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
 * 있어야 한다. 가려지는 것은 화면과 API 응답이다.
 *
 * <p><b>2026-10-03 원본 실측으로 다시 맞췄다.</b> 글 하나는 <b>두 줄</b>이다 — 글, 그 아래 시각
 * ('2024/10/22 오전 8:57:23', 초까지). 우리는 한 줄 오른쪽에 '2024-10-22 08:57' 과 [삭제]를 달았다.
 * 원본 목록에는 [삭제]가 없고 화면에 안내 문구도 없다 — 둘 다 뺐다. 글상자 판과 목록 판은 따로 흰 판이다.
 * 빈 채로 [저장(F8)]을 누르면 원본은 글상자만 빨개진다.
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

  useShortcut('F8', () => void save())

  return (
    <EcListShell title="익명게시판" searchable={false} option={false}>
      {/* 원본 실측: 글상자 720×194, [저장(F8)] 이 바로 아래, 전체가 왼쪽 정렬 720 폭 — 글상자 판과 목록 판이 따로 흰 판이다 */}
      <div className="w-[720px] max-w-[100%]">
        <div className="bg-ec-panel rounded-ec-panel p-[9px]">
          <textarea className="ec-input w-full h-[194px] py-[5.4px] resize-y" aria-label="익명 글"
                    value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-[5px]">
            <button className="ec-btn ec-btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? '저장 중…' : '저장(F8)'}
            </button>
          </div>
          {error && <p className="ec-alert ec-alert-danger mt-[8px]">{error}</p>}
        </div>

        {/* 목록. 원본은 머리글 줄 없이 글 한 줄 · 시각 한 줄씩 쌓인다. */}
        <div className="bg-ec-panel rounded-ec-panel p-[9px] mt-[10px]">
          <table className="w-full text-left">
            <tbody>
              {rows.length === 0 ? (
                <tr><td className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : rows.flatMap((p) => [
                <tr key={`${p.id}-t`}><td className="whitespace-pre-wrap border-b-0">{p.content || p.title}</td></tr>,
                <tr key={`${p.id}-d`}><td>{when(p.createdAt)}</td></tr>,
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </EcListShell>
  )
}
