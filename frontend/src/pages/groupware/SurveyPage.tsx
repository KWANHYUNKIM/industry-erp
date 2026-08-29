import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { openAppBarPanel } from '../../components/AppBarPanel'
import Modal from '../../components/Modal'
import type { SurveyDoc, SurveyResult, SurveyStatus } from '../../api/types'
import { EcCond } from '../../components/EcStatusPanel'

/**
 * 그룹웨어 > 공유정보 > 설문조사 > 설문조사조회 (이카운트 E070257)
 *
 * 원본 탭: 전체 · 초안 · 진행중 · 완료 · 미발송
 * 원본 컬럼(실측): (선택 25) 게시글번호 70 · 작성일 85 · 설문종료일 85 · 제목 190 ·
 *                  작성자 60 · 진행상태 55 · 설문조사결과 60 · 설문조사 참여여부 140
 *
 * 원본 하단은 [신규(F2)][Email][대화방][선택삭제] 인데, Email·대화방은 이 화면에서 무엇을
 * 보내고 어떤 방을 여는지 확인하지 못해 넣지 않았다.
 */

const TABS = ['전체', '초안', '진행중', '완료', '미발송'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, SurveyStatus> = {
  초안: 'DRAFT', 진행중: 'OPEN', 완료: 'CLOSED', 미발송: 'UNSENT',
}
const STATUS_COLOR: Record<SurveyStatus, string> = {
  DRAFT: '#8a929c', OPEN: 'var(--ec-blue)', CLOSED: '#1c7c3c', UNSENT: '#c07a00',
}

const dateOf = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, '/') : '')
const COLS = ['3.2%', '9.1%', '11%', '11%', '24.7%', '7.8%', '7.1%', '7.8%', '18.2%']

export default function SurveyPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SurveyDoc[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 설문조사조회의 보기 [설문대상구분](내부·외부)과 [결과공개범위]
   * (전체공개·일부공개·비공개). 우리는 제목·작성자로만 걸렀다 —
   * <b>외부 설문만</b> 이나 <b>비공개 설문만</b> 을 보려면 눈으로 골라야 했다.
   */
  /*
   * 원본 설문조사조회의 조건 차례는 <b>작성일 · 설문종료일 · 설문대상구분 ·
   * 제목 · 작성자 · 게시글번호</b> 다(사본 실측). 우리는 둘뿐이었는데
   * 다섯 값이 다 표에 찍히고 있었다 — 보이면서도 거를 수가 없었다.
   */
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [endFrom, setEndFrom] = useState('')
  const [endTo, setEndTo] = useState('')
  const [titleCond, setTitleCond] = useState('')
  const [writerCond, setWriterCond] = useState('')
  const [postNoCond, setPostNoCond] = useState('')
  const [scope, setScope] = useState('')
  const [visibility, setVisibility] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [answering, setAnswering] = useState<SurveyDoc | null>(null)
  const [result, setResult] = useState<SurveyResult | null>(null)

  async function load() {
    setError('')
    try { setRows((await api.get<SurveyDoc[]>('/surveys')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  async function openResult(s: SurveyDoc) {
    try { setResult((await api.get<SurveyResult>(`/surveys/${s.id}/result`)).data) }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function removeSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return alert('지울 설문을 고르세요. (왼쪽 회색 번호 칸을 누릅니다)')
    if (!confirm(`${targets.length}건을 삭제할까요? 응답도 함께 사라집니다.`)) return
    const failed: string[] = []
    for (const r of targets) {
      try { await api.delete(`/surveys/${r.id}`) }
      catch (err) { failed.push(`${r.title}: ${extractErrorMessage(err)}`) }
    }
    setSelected(new Set())
    void load()
    if (failed.length) alert(`지우지 못한 설문 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => !keyword || r.title.includes(keyword) || (r.writerName ?? '').includes(keyword))
    .filter((r) => !scope || r.targetScope === scope)
    .filter((r) => !visibility || r.resultVisibility === visibility)
    .filter((r) => !madeFrom || dateOf(r.createdAt) >= madeFrom)
    .filter((r) => !madeTo || dateOf(r.createdAt) <= madeTo)
    .filter((r) => !endFrom || dateOf(r.endAt) >= endFrom)
    .filter((r) => !endTo || dateOf(r.endAt) <= endTo)
    .filter((r) => !titleCond || r.title.includes(titleCond))
    .filter((r) => !writerCond || (r.writerName ?? '').includes(writerCond))
    .filter((r) => !postNoCond || String(r.postNo).includes(postNoCond)),
    [rows, tab, keyword, scope, visibility, madeFrom, madeTo, endFrom, endTo,
      titleCond, writerCond, postNoCond])

  const tabCount = (t: Tab) => (t === '전체' ? rows.length : rows.filter((r) => r.status === TAB_STATUS[t]).length)

  return (
    <EcListShell
      title="설문조사조회"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => navigate('/groupware/survey-input')}
      actions={[
        /*
         * 원본 설문조사조회의 [대화방]. '사내 대화방이 없다' 고 적어 뒀는데
         * <b>대화방은 진작 있었다</b>(ChatRoom·앱바 💬). 설문을 보다 담당자에게 바로
         * 물으려면 화면을 떠나지 않고 열려야 한다 — 앱바의 <b>같은 창</b>을 연다.
         *
         * <p>원본 차례상 <b>[선택삭제] 앞</b>이다(신규(F2) · 대화방 · 선택삭제).
         */
        { label: '대화방', onClick: () => openAppBarPanel('messenger') },
        { label: '선택삭제', onClick: removeSelected },
        { label: 'Excel' },
      ]}
    >
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t} {tabCount(t)}
          </button>
        ))}
      </div>

      {/* 원본 조건의 [설문대상구분]·[결과공개범위]. 보기 이름도 원본 그대로다. */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 차례: <b>작성일 · 설문종료일</b> · 설문대상구분 · 제목 · 작성자 · 게시글번호 */}
        <EcCond label="작성일">
          <input type="date" className="ec-input" value={madeFrom} onChange={(e) => setMadeFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={madeTo} onChange={(e) => setMadeTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="설문종료일">
          <input type="date" className="ec-input" value={endFrom} onChange={(e) => setEndFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={endTo} onChange={(e) => setEndTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="설문대상구분">
          <div className="ec-pills">
            {([['', '전체'], ['INTERNAL', '내부'], ['EXTERNAL', '외부']] as const).map(([v, l]) => (
              <button key={l} type="button" className={`ec-pill no-ec${scope === v ? ' active' : ''}`}
                      onClick={() => setScope(v)}>{l}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="결과공개범위">
          <div className="ec-pills">
            {([['', '전체'], ['ALL', '전체공개'], ['PARTIAL', '일부공개'], ['NONE', '비공개']] as const).map(([v, l]) => (
              <button key={l} type="button" className={`ec-pill no-ec${visibility === v ? ' active' : ''}`}
                      onClick={() => setVisibility(v)}>{l}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="제목">
          <input className="ec-input" value={titleCond} onChange={(e) => setTitleCond(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="작성자">
          <input className="ec-input" value={writerCond} onChange={(e) => setWriterCond(e.target.value)} style={{ width: 130 }} />
        </EcCond>
        <EcCond label="게시글번호">
          <input className="ec-input" value={postNoCond} onChange={(e) => setPostNoCond(e.target.value)} style={{ width: 110 }} />
        </EcCond>
      </ul>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead>
          <tr>
            <th></th><th>게시글번호</th><th>작성일</th><th>설문종료일</th><th>제목</th>
            <th>작성자</th><th>진행상태</th><th>설문조사결과</th><th>설문조사 참여여부</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td
                onClick={() => toggle(r.id)}
                title="눌러서 선택 (하단 [선택삭제])"
                style={{
                  textAlign: 'center', cursor: 'pointer',
                  background: selected.has(r.id) ? 'var(--ec-blue-light)' : '#f3f3f3',
                  color: selected.has(r.id) ? 'var(--ec-blue-dark)' : '#8a929c',
                  fontWeight: selected.has(r.id) ? 700 : 400,
                }}
              >
                {i + 1}
              </td>
              <td style={{ textAlign: 'center' }}>{r.postNo}</td>
              <td style={{ textAlign: 'center' }}>{dateOf(r.createdAt)}</td>
              <td style={{ textAlign: 'center' }}>{dateOf(r.endAt)}</td>
              <td>
                {r.title}
                <span style={{ marginLeft: 6, color: 'var(--ec-label)', fontSize: 11.5 }}>
                  문항 {r.questionCount}
                  {r.anonymous && ' · 익명'}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>{r.writerName ?? ''}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn ec-btn-sm" onClick={() => void openResult(r)}>결과</button>
              </td>
              <td style={{ textAlign: 'center' }}>
                {/* 종료일이 지난 설문에 [응답하기] 를 띄우면 눌러도 400 만 난다 — 상태가 '진행중'
                    이어도 시간으로 닫히므로 expired 를 같이 본다. */}
                {r.answeredByMe ? (
                  <span style={{ color: '#1c7c3c' }}>참여</span>
                ) : r.status === 'OPEN' && !r.expired ? (
                  <button className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => setAnswering(r)}>응답하기</button>
                ) : (
                  <span style={{ color: 'var(--ec-label)' }}>{r.expired && r.status === 'OPEN' ? '기간종료' : '미참여'}</span>
                )}
                <span style={{ marginLeft: 6, color: 'var(--ec-label)', fontSize: 11.5 }}>
                  {r.responseCount}/{r.targetCount || '-'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {answering && (
        <AnswerModal
          survey={answering}
          onClose={() => setAnswering(null)}
          onDone={() => { setAnswering(null); void load() }}
        />
      )}

      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
    </EcListShell>
  )
}

/** 설문에 실제로 답하는 창. 유형마다 입력 모양이 다르다. */
function AnswerModal({ survey, onClose, onDone }: { survey: SurveyDoc; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState<Record<number, string[]>>({})
  const [error, setError] = useState('')

  const set = (qid: number, v: string[]) => setValues((s) => ({ ...s, [qid]: v }))
  const toggleMulti = (qid: number, option: string) => {
    const cur = values[qid] ?? []
    set(qid, cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option])
  }

  async function submit() {
    setError('')
    try {
      await api.post(`/surveys/${survey.id}/respond`, {
        answers: Object.entries(values).map(([qid, v]) => ({ questionId: Number(qid), values: v })),
      })
      onDone()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <Modal open title={survey.title} width={640} onClose={onClose}>
      <div style={{ fontSize: 13 }}>
        {survey.headerText && (
          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid var(--ec-border)', padding: 10, marginBottom: 12 }}>
            {survey.headerText}
          </div>
        )}
        {survey.anonymous && (
          <p style={{ color: 'var(--ec-label)', fontSize: 12, marginBottom: 10 }}>
            익명 설문입니다 — 누가 답했는지 저장하지 않습니다.
          </p>
        )}

        {survey.questions.map((q) => (
          <div key={q.id} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {q.seq}. {q.content}
              {q.required && <span style={{ color: '#c60a2e', marginLeft: 4 }}>*</span>}
            </div>

            {(q.type === 'SINGLE' || q.type === 'SINGLE_ETC') && q.options.map((o) => (
              <label key={o} style={{ display: 'block', paddingLeft: 12 }}>
                <input type="radio" name={`q${q.id}`} checked={(values[q.id] ?? [])[0] === o} onChange={() => set(q.id, [o])} /> {o}
              </label>
            ))}

            {(q.type === 'MULTI' || q.type === 'MULTI_ETC' || q.type === 'RANK') && q.options.map((o) => (
              <label key={o} style={{ display: 'block', paddingLeft: 12 }}>
                <input type="checkbox" checked={(values[q.id] ?? []).includes(o)} onChange={() => toggleMulti(q.id, o)} /> {o}
              </label>
            ))}

            {(q.type === 'SINGLE_ETC' || q.type === 'MULTI_ETC') && (
              <div style={{ paddingLeft: 12, marginTop: 4 }}>
                <input className="ec-input" placeholder="기타 (직접 입력)" style={{ width: '70%' }}
                  onChange={(e) => {
                    const others = (values[q.id] ?? []).filter((v) => q.options.includes(v))
                    set(q.id, e.target.value.trim() ? [...others, e.target.value.trim()] : others)
                  }} />
              </div>
            )}

            {q.type === 'SHORT_TEXT' && (
              <input className="ec-input" style={{ width: '70%', marginLeft: 12 }}
                value={(values[q.id] ?? [])[0] ?? ''} onChange={(e) => set(q.id, e.target.value ? [e.target.value] : [])} />
            )}

            {q.type === 'LONG_TEXT' && (
              <textarea className="ec-input" rows={3} style={{ width: '90%', marginLeft: 12, height: 'auto' }}
                value={(values[q.id] ?? [])[0] ?? ''} onChange={(e) => set(q.id, e.target.value ? [e.target.value] : [])} />
            )}

            {q.type === 'DATE' && (
              <input type="date" className="ec-input" style={{ width: 150, marginLeft: 12 }}
                value={(values[q.id] ?? [])[0] ?? ''} onChange={(e) => set(q.id, e.target.value ? [e.target.value] : [])} />
            )}

            {q.type === 'SCALE' && (
              <div style={{ paddingLeft: 12 }}>
                {['1', '2', '3', '4', '5'].map((n) => (
                  <label key={n} style={{ marginRight: 10 }}>
                    <input type="radio" name={`q${q.id}`} checked={(values[q.id] ?? [])[0] === n} onChange={() => set(q.id, [n])} /> {n}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
        <div style={{ marginTop: 10 }}>
          <button className="ec-btn ec-btn-primary" onClick={() => void submit()}>제출</button>
          <button className="ec-btn" style={{ marginLeft: 4 }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}

function ResultModal({ result, onClose }: { result: SurveyResult; onClose: () => void }) {
  return (
    <Modal open title={`${result.title} — 결과`} width={640} onClose={onClose}>
      <div style={{ fontSize: 13 }}>
        <p style={{ marginBottom: 10, color: 'var(--ec-label)' }}>
          대상 {result.targetCount}명 · 응답 {result.responseCount}건 · 응답률 {result.responseRate}%
          {result.anonymous && ' · 익명'}
        </p>
        {result.questions.map((q) => {
          const max = Math.max(1, ...Object.values(q.counts))
          return (
            <div key={q.questionId} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600 }}>
                {q.seq}. {q.content}
                <span style={{ marginLeft: 6, color: 'var(--ec-label)', fontWeight: 400, fontSize: 11.5 }}>
                  {q.typeName} · 응답 {q.answeredCount}
                </span>
              </div>
              {Object.entries(q.counts).map(([opt, n]) => (
                <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, marginTop: 2 }}>
                  <span style={{ width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
                  <span style={{ height: 10, background: 'var(--ec-blue)', width: `${(n / max) * 60}%`, minWidth: n ? 3 : 0 }} />
                  <span style={{ color: 'var(--ec-label)' }}>{n}</span>
                </div>
              ))}
              {q.texts.length > 0 && (
                <ul style={{ paddingLeft: 28, margin: '4px 0 0', color: '#3c4553' }}>
                  {q.texts.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
