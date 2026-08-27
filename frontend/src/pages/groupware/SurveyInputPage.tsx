import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import { ymd } from '../../components/EcPeriodPicks'
import type { QuestionType, SurveyDoc } from '../../api/types'

/**
 * 그룹웨어 > 공유정보 > 설문조사 > 설문조사입력 (이카운트 E070256)
 *
 * 원본은 목록이 아니라 <b>설문 한 건을 쓰는 폼</b>이다. 우리 화면은 제목·기간·대상인원(정수)만
 * 받는 등록 폼이었는데, 정작 <b>질문이 없었다</b> — 질문 없는 설문은 설문이 아니다.
 *
 * 원본 폼 순서 그대로: 작성자 · 제목 · 설문종료일 · 설문대상구분 · 설문대상 · 익명사용여부 ·
 * 결과공개범위 · 머리말 + 질문 그리드(질문유형 · 질문내용 · 보기항목1~5 · 필수항목).
 * 하단은 [저장] [미리보기] [리스트].
 *
 * 원본에 있으나 넣지 않은 것: [반복설정].
 *
 * <p>[첨부]는 이제 있다 — 예전에는 "파일 업로드가 이 화면에 아직 없다" 고 적어 뒀는데,
 * 공용 EcFileDrop 과 /files 가 생기면서 붙일 수 있게 됐다. 설문 안내문에 딸린 양식·사진을
 * 같이 보내는 자리다.
 */

const TYPES: { value: QuestionType; label: string; options: boolean }[] = [
  { value: 'SINGLE', label: '단일 선택', options: true },
  { value: 'MULTI', label: '복수 선택', options: true },
  { value: 'SINGLE_ETC', label: '단일선택기타', options: true },
  { value: 'MULTI_ETC', label: '복수선택기타', options: true },
  { value: 'SHORT_TEXT', label: '단답형', options: false },
  { value: 'LONG_TEXT', label: '장문형', options: false },
  { value: 'RANK', label: '순위입력', options: true },
  { value: 'DATE', label: '날짜', options: false },
  { value: 'SCALE', label: '점수 척도형', options: false },
]

interface QuestionRow {
  type: QuestionType | ''
  content: string
  options: string[]      // 항상 5칸
  required: boolean
}
const emptyRow = (): QuestionRow => ({ type: '', content: '', options: ['', '', '', '', ''], required: false })

interface UserRow { id: number; name: string; username: string }

export default function SurveyInputPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [preview, setPreview] = useState(false)

  const [title, setTitle] = useState('')
  const [endDate, setEndDate] = useState(() => ymd(new Date(Date.now() + 30 * 86400000)))
  const [endTime, setEndTime] = useState('18:00')
  const [scope, setScope] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL')
  const [targets, setTargets] = useState<string[]>([])
  const [anonymous, setAnonymous] = useState(false)
  const [visibility, setVisibility] = useState<'ALL' | 'PARTIAL' | 'NONE'>('ALL')
  const [useHeader, setUseHeader] = useState(false)
  const [headerText, setHeaderText] = useState('')
  /** 원본 [여기에 파일 놓기]. 한 건만 붙는 자리다. */
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  // 원본은 빈 줄 3개로 시작한다.
  const [rows, setRows] = useState<QuestionRow[]>([emptyRow(), emptyRow(), emptyRow()])

  useEffect(() => {
    api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  const patch = (i: number, next: Partial<QuestionRow>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...next } : r)))

  const patchOption = (i: number, oi: number, v: string) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, options: r.options.map((o, j) => (j === oi ? v : o)) } : r)))

  /** 저장 대상 문항 — 유형과 내용이 모두 있는 줄만. 원본도 빈 줄은 무시한다. */
  const filled = rows.filter((r) => r.type && r.content.trim())

  /** 파일을 먼저 올려 id 를 받고, 설문을 저장할 때 그 id 를 붙인다(기안서·업무글과 같다). */
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

  const payload = (draft: boolean) => ({
    title,
    endAt: `${endDate}T${endTime}:00`,
    targetScope: scope,
    anonymous,
    resultVisibility: visibility,
    headerText: useHeader ? headerText : null,
    attachmentId: attachment ? attachment.id : null,
    targetUserIds: targets.map(Number),
    questions: filled.map((r, i) => ({
      seq: i + 1,
      type: r.type,
      content: r.content,
      option1: r.options[0] || null, option2: r.options[1] || null, option3: r.options[2] || null,
      option4: r.options[3] || null, option5: r.options[4] || null,
      required: r.required,
    })),
    draft,
  })

  async function save(draft: boolean) {
    setError(''); setOk('')
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (!draft && filled.length === 0) return setError('문항을 한 줄 이상 입력하세요. (초안으로는 저장할 수 있습니다)')
    try {
      const r = await api.post<SurveyDoc>('/surveys', payload(draft))
      setOk(`${draft ? '초안으로 저장' : '설문 발송'}되었습니다. (게시글번호 ${r.data.postNo})`)
      setTitle(''); setTargets([]); setHeaderText(''); setUseHeader(false)
      setRows([emptyRow(), emptyRow(), emptyRow()])
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 110 }
  const radio = (name: string, checked: boolean, onChange: () => void, label: string) => (
    <label key={label} style={{ marginRight: 12, fontSize: 12 }}>
      <input type="radio" name={name} checked={checked} onChange={onChange} /> {label}
    </label>
  )

  return (
    <EcListShell
      title="설문조사입력"
      searchable={false}
      actions={[
        { label: '저장', primary: true, onClick: () => void save(false) },
        { label: '초안저장', onClick: () => void save(true) },
        { label: '미리보기', onClick: () => setPreview(true) },
        { label: '리스트', onClick: () => navigate('/groupware/survey') },
      ]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {ok && <p style={{ marginBottom: 8, background: '#eaf7ee', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      <table className="w-full text-left" style={{ marginBottom: 10 }}>
        <tbody>
          <tr>
            <th style={th}>제목 *</th>
            <td colSpan={3}><input className="ec-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} /></td>
          </tr>
          <tr>
            <th style={th}>설문종료일</th>
            <td>
              <input type="date" className="ec-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 140 }} />
              <input type="time" className="ec-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: 110, marginLeft: 4 }} />
            </td>
            <th style={th}>설문대상구분</th>
            <td>
              {radio('scope', scope === 'INTERNAL', () => setScope('INTERNAL'), '내부')}
              {radio('scope', scope === 'EXTERNAL', () => setScope('EXTERNAL'), '외부')}
            </td>
          </tr>
          <tr>
            <th style={th}>설문대상</th>
            <td colSpan={3}>
              <CodePickerField
                label="설문대상" hideLabel multiple values={targets}
                onChangeMulti={(v) => setTargets(v)}
                items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))}
              />
            </td>
          </tr>
          <tr>
            <th style={th}>익명사용여부</th>
            <td>
              {radio('anon', anonymous, () => setAnonymous(true), '사용')}
              {radio('anon', !anonymous, () => setAnonymous(false), '사용안함')}
            </td>
            <th style={th}>결과공개범위</th>
            <td>
              {radio('vis', visibility === 'ALL', () => setVisibility('ALL'), '전체공개')}
              {radio('vis', visibility === 'PARTIAL', () => setVisibility('PARTIAL'), '일부공개')}
              {radio('vis', visibility === 'NONE', () => setVisibility('NONE'), '비공개')}
            </td>
          </tr>
          <tr>
            {/* 원본 [첨부] — 머리말 다음 줄이다. */}
            <th style={th}>첨부</th>
            <td colSpan={3}>
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
            </td>
          </tr>
          <tr>
            <th style={th}>머리말</th>
            <td colSpan={3}>
              {radio('hdr', !useHeader, () => setUseHeader(false), '사용안함')}
              {radio('hdr', useHeader, () => setUseHeader(true), '사용')}
              {useHeader && (
                <input className="ec-input" value={headerText} onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="설문 맨 위에 보여줄 안내문" style={{ width: '60%', marginLeft: 8 }} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 질문 그리드 — 원본 실측: (24) 질문유형·질문내용·보기항목1~5·필수항목 각 100 */}
      <table className="w-full text-left ec-grid-input">
        <colgroup>
          <col style={{ width: '2.9%' }} />
          <col style={{ width: '12.1%' }} />
          <col style={{ width: '12.1%' }} />
          {[0, 1, 2, 3, 4].map((i) => <col key={i} style={{ width: '12.1%' }} />)}
          <col style={{ width: '12.1%' }} />
        </colgroup>
        <thead>
          <tr>
            <th></th><th>질문유형</th><th>질문내용</th>
            <th>보기항목1</th><th>보기항목2</th><th>보기항목3</th><th>보기항목4</th><th>보기항목5</th>
            <th>필수항목</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const usesOptions = TYPES.find((t) => t.value === r.type)?.options ?? false
            return (
              <tr key={i}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                <td>
                  <select className="ec-input" value={r.type} onChange={(e) => patch(i, { type: e.target.value as QuestionType })} style={{ width: '100%' }}>
                    <option value="">선택</option>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td><input className="ec-input" value={r.content} onChange={(e) => patch(i, { content: e.target.value })} style={{ width: '100%' }} /></td>
                {r.options.map((o, oi) => (
                  <td key={oi}>
                    {/* 보기를 안 쓰는 유형이면 칸을 잠근다 — 적어도 저장되지 않으니 잠그는 편이 정직하다. */}
                    <input className="ec-input" value={o} disabled={!usesOptions}
                      onChange={(e) => patchOption(i, oi, e.target.value)} style={{ width: '100%' }} />
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={r.required} onChange={(e) => patch(i, { required: e.target.checked })} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 6 }}>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>줄 추가</button>
        {rows.length > 3 && (
          <button type="button" className="ec-btn ec-btn-sm" style={{ marginLeft: 4 }}
            onClick={() => setRows((rs) => rs.slice(0, -1))}>마지막 줄 삭제</button>
        )}
      </div>

      <Modal open={preview} title="미리보기" width={640} onClose={() => setPreview(false)}>{(
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title || '(제목 없음)'}</div>
          {useHeader && headerText && (
            <div style={{ whiteSpace: 'pre-wrap', border: '1px solid var(--ec-border)', padding: 10, marginBottom: 10 }}>{headerText}</div>
          )}
          {filled.length === 0 ? (
            <p style={{ color: 'var(--ec-label)' }}>문항이 없습니다.</p>
          ) : filled.map((r, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>
                {i + 1}. {r.content}
                {r.required && <span style={{ color: '#c60a2e', marginLeft: 4 }}>*</span>}
                <span style={{ marginLeft: 6, color: 'var(--ec-label)', fontWeight: 400, fontSize: 11.5 }}>
                  {TYPES.find((t) => t.value === r.type)?.label}
                </span>
              </div>
              <div style={{ paddingLeft: 14, color: '#3c4553' }}>
                {r.options.filter(Boolean).map((o, oi) => <div key={oi}>· {o}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}</Modal>
    </EcListShell>
  )
}
