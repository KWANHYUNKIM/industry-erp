import { useEffect, useState, useRef} from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import { useShortcut } from '../../utils/useShortcut'
import type { QuestionType, SurveyDoc } from '../../types/api'

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
  const { user } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [preview, setPreview] = useState(false)

  const [title, setTitle] = useState('')
  /*
   * 원본 설문종료일 기본값: <b>오늘부터 60일 뒤</b>, 시각은 <b>지금을 10분 단위로 올린 것</b>
   * (2026-10-03 14:38 에 열면 2026/12/02 오후 2:40). 우리는 30일 뒤 18:00 이었다.
   */
  const [endDate, setEndDate] = useState(() => ymd(new Date(Date.now() + 60 * 86400000)))
  const [endTime, setEndTime] = useState(() => {
    const d = new Date(); const m = Math.ceil(d.getMinutes() / 10) * 10
    d.setMinutes(m, 0, 0)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
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
    // 원본은 내부 설문에 [설문대상]을 안 고르고 저장하면 그 칸을 빨갛게 한다(2026-10-03 실측).
    if (!draft && scope === 'INTERNAL' && targets.length === 0) return setError('설문대상을 선택하세요.')
    if (!draft && filled.length === 0) return setError('문항을 한 줄 이상 입력하세요. (초안으로는 저장할 수 있습니다)')
    // 원본 [저장]은 '설문조사를 진행하시겠습니까?' 를 먼저 묻는다.
    if (!draft && !window.confirm('설문조사를 진행하시겠습니까?')) return
    try {
      const r = await api.post<SurveyDoc>('/surveys', payload(draft))
      setOk(`${draft ? '초안으로 저장' : '설문 발송'}되었습니다. (게시글번호 ${r.data.postNo})`)
      setTitle(''); setTargets([]); setHeaderText(''); setUseHeader(false)
      setRows([emptyRow(), emptyRow(), emptyRow()])
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const radio = (name: string, checked: boolean, onChange: () => void, label: string) => (
    <label key={label} className="mr-[12px] text-[12px]">
      <input type="radio" name={name} checked={checked} onChange={onChange} /> {label}
    </label>
  )


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '설문조사입력', [])
  // 원본 [임시저장(F8)]
  useShortcut('F8', () => void save(true), !preview)

  return (
    <EcListShell
      title="설문조사입력"
      searchable={false}
      actions={[
        { label: '저장', primary: true, onClick: () => void save(false) },
        // 원본은 [저장▲] 를 펴면 [임시저장(F8)] 이 나온다. 우리 '초안' 이 그것이다.
        { label: '임시저장(F8)', onClick: () => void save(true) },
        { label: '미리보기', onClick: () => setPreview(true) },
        { label: '리스트', onClick: () => navigate('/groupware/survey') },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      {/* 원본 차례(2026-10-03 실측): 작성자 · 제목 · 설문종료일 · 설문대상구분(내부/외부 · 설문대상 · 익명사용여부)
          · 첨부 · 결과공개범위 · 머리말 — 한 줄에 하나씩. */}
      <ul className="ec-form mb-[10px]">
        <li className="wide"><div className="title">작성자</div><div className="form">{user?.name ?? ''}</div></li>
        <li className="wide">
          <div className="title">제목</div>
          <div className="form"><input className="ec-input w-full" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        </li>
        <li className="wide">
          <div className="title">설문종료일</div>
          <div className="form">
            <input type="date" className="ec-input w-[140px]" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <input type="time" className="ec-input w-[110px]" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </li>
        <li className="wide">
          <div className="title">설문대상구분</div>
          <div className="form flex-col items-start">
            <div>
              {radio('scope', scope === 'INTERNAL', () => setScope('INTERNAL'), '내부')}
              {radio('scope', scope === 'EXTERNAL', () => setScope('EXTERNAL'), '외부')}
            </div>
            <div className="flex items-center gap-[6px] w-full">
              <span className="text-[12px] text-ec-label">설문대상</span>
              <CodePickerField
                label="설문대상" hideLabel multiple values={targets}
                onChangeMulti={(v) => setTargets(v)}
                items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))}
              />
            </div>
            <div className="flex items-center gap-[6px]">
              <span className="text-[12px] text-ec-label">익명사용여부</span>
              {radio('anon', anonymous, () => setAnonymous(true), '사용')}
              {radio('anon', !anonymous, () => setAnonymous(false), '사용안함')}
            </div>
          </div>
        </li>
        <li className="wide">
          <div className="title">첨부</div>
          <div className="form">
            <EcFileDrop busy={uploading} disabled={uploading}
                        onFiles={(fs) => { if (fs[0]) void upload(fs[0]) }}>
              {attachment && (
                <span className="text-[12px] text-ec-navy">
                  {attachment.name}
                  <span onClick={() => setAttachment(null)}
                        className="cursor-pointer ml-[6px] font-bold">×</span>
                </span>
              )}
            </EcFileDrop>
          </div>
        </li>
        <li className="wide">
          <div className="title">결과공개범위</div>
          <div className="form">
            {radio('vis', visibility === 'ALL', () => setVisibility('ALL'), '전체공개')}
            {radio('vis', visibility === 'PARTIAL', () => setVisibility('PARTIAL'), '일부공개')}
            {radio('vis', visibility === 'NONE', () => setVisibility('NONE'), '비공개')}
          </div>
        </li>
        <li className="wide">
          <div className="title">머리말</div>
          <div className="form">
            {radio('hdr', !useHeader, () => setUseHeader(false), '사용안함')}
            {radio('hdr', useHeader, () => setUseHeader(true), '사용')}
            {useHeader && (
              <input className="ec-input flex-1" value={headerText} onChange={(e) => setHeaderText(e.target.value)}
                placeholder="설문 맨 위에 보여줄 안내문" />
            )}
          </div>
        </li>
      </ul>

      {/* 질문 그리드 — 원본 실측: (24) 질문유형·질문내용·보기항목1~5·필수항목 각 100 */}
      <table ref={tableRef} className="w-full text-left ec-grid-input">
        <colgroup>
          <col className="w-[2.9%]" />
          <col className="w-[12.1%]" />
          <col className="w-[12.1%]" />
          {[0, 1, 2, 3, 4].map((i) => <col key={i} className="w-[12.1%]" />)}
          <col className="w-[12.1%]" />
        </colgroup>
        <thead>
          <tr>
            <th></th><th>질문유형</th><th>질문내용</th>
            {/* 원본 실측: 보기항목 다섯 칸과 [필수항목]은 가운데다. */}
            <th className="text-center">보기항목1</th><th className="text-center">보기항목2</th><th className="text-center">보기항목3</th><th className="text-center">보기항목4</th><th className="text-center">보기항목5</th>
            <th className="text-center">필수항목</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const usesOptions = TYPES.find((t) => t.value === r.type)?.options ?? false
            return (
              <tr key={i}>
                <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
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
                <td className="text-center">
                  <input type="checkbox" checked={r.required} onChange={(e) => patch(i, { required: e.target.checked })} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-[6px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>줄 추가</button>
        {rows.length > 3 && (
          <button type="button" className="ec-btn ec-btn-sm" style={{ marginLeft: 4 }}
            onClick={() => setRows((rs) => rs.slice(0, -1))}>마지막 줄 삭제</button>
        )}
      </div>

      <Modal error={error} open={preview} title="미리보기" width={640} onClose={() => setPreview(false)}>{(
        <div className="text-[13px]">
          <div className="font-bold text-[15px] mb-[6px]">{title || '(제목 없음)'}</div>
          {useHeader && headerText && (
            <div className="whitespace-pre-wrap border border-ec-line border-solid p-[10px] mb-[10px]">{headerText}</div>
          )}
          {filled.length === 0 ? (
            <p className="text-ec-label">문항이 없습니다.</p>
          ) : filled.map((r, i) => (
            <div key={i} className="mb-[12px]">
              <div className="font-semibold">
                {i + 1}. {r.content}
                {r.required && <span className="text-ec-danger ml-[4px]">*</span>}
                <span className="ml-[6px] text-ec-label font-normal text-[11.5px]">
                  {TYPES.find((t) => t.value === r.type)?.label}
                </span>
              </div>
              <div className="pl-[14px] text-ec-text">
                {r.options.filter(Boolean).map((o, oi) => <div key={oi}>· {o}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}</Modal>
    </EcListShell>
  )
}
