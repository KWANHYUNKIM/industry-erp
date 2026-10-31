import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { openAppBarPanel } from '../../components/AppBarPanel'
import Modal from '../../components/Modal'
import type { SurveyDoc, SurveyResult, SurveyStatus } from '../../types/api'
import { EcCond } from '../../components/EcStatusPanel'
import { printHtml } from '../../utils/print'
import { matrixToXlsx } from '../../utils/excel'
import { escapeHtml } from '../../utils/escapeHtml'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcIcon from '../../components/ui/EcIcon'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'

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

const dateOf = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, '/') : '')
/** 원본 칸 글 '2026/09/23 오전 9:57:08' (2026-10-13 실측). */
const dateTimeOf = (iso: string | null) => {
  if (!iso) return ''
  const h = Number(iso.slice(11, 13))
  const rest = iso.slice(13, 19) || ':00:00'
  return `${dateOf(iso)} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}${rest.length === 6 ? rest : rest + ':00'}`
}
/** '설문조사' 창 머리 '설문기간 : 2026/09/23 ~ 2026/09/26 오후 1:00'. */
const periodOf = (r: SurveyDoc) => `설문기간 : ${dateOf(r.createdAt)} ~ ${dateTimeOf(r.endAt).replace(/:\d{2}$/, '')}`
interface Participant { department: string | null; name: string; username: string; participated: boolean }
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
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [answering, setAnswering] = useState<SurveyDoc | null>(null)
  const [result, setResult] = useState<SurveyResult | null>(null)
  /** 원본 제목 → '설문조사' 창(보기 · 답하기 · [설문결과보기][수정][복사][삭제][닫기]). */
  const [viewing, setViewing] = useState<SurveyDoc | null>(null)
  /** 원본 [설문조사 참여여부] '보기' → '설문조사참여여부'. */
  const [participants, setParticipants] = useState<Participant[] | null>(null)
  /** 원본 '설문조사' 창 [H] → '이력'. */
  const [history, setHistory] = useState<SurveyDoc | null>(null)
  async function openParticipants(s: SurveyDoc) {
    try { setParticipants((await api.get<Participant[]>(`/surveys/${s.id}/participants`)).data) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  async function removeOne(s: SurveyDoc) {
    // 원본 '설문조사' 창 [삭제] 문구(2026-10-13 실측).
    if (!(await ecConfirm('삭제한 데이터는 복구되지 않습니다.\n\n삭제하겠습니까?'))) return
    try { await api.delete(`/surveys/${s.id}`); setViewing(null); void load() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  /** 원본 진행 중 설문 창 [설문끝내기] — 묻고 나서 '완료' 로 바꾼다(2026-10-13 실측, 창은 그대로 [설문결과보기] 줄로 바뀐다). */
  async function finishOne(s: SurveyDoc) {
    if (!(await ecConfirm('설문을 끝내면 더이상 설문을 진행할 수 없습니다. 계속 진행하시겠습니까?'))) return
    try {
      const r = await api.patch<SurveyDoc>(`/surveys/${s.id}`, { status: 'CLOSED' })
      setViewing(r.data); void load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  async function load() {
    setError('')
    try { setRows((await api.get<SurveyDoc[]>('/surveys')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  async function openResult(s: SurveyDoc) {
    try { setResult((await api.get<SurveyResult>(`/surveys/${s.id}/result`)).data) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  async function removeSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return ecAlert('지울 설문을 고르세요. (왼쪽 회색 번호 칸을 누릅니다)')
    if (!(await ecConfirm(`${targets.length}건을 삭제할까요? 응답도 함께 사라집니다.`))) return
    const failed: string[] = []
    for (const r of targets) {
      try { await api.delete(`/surveys/${r.id}`) }
      catch (err) { failed.push(`${r.title}: ${extractErrorMessage(err)}`) }
    }
    setSelected(new Set())
    void load()
    if (failed.length) void ecAlert(`지우지 못한 설문 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => !keyword || r.title.includes(keyword) || (r.writerName ?? '').includes(keyword))
    .filter((r) => !scope || r.targetScope === scope)
    .filter((r) => !madeFrom || dateOf(r.createdAt) >= madeFrom)
    .filter((r) => !madeTo || dateOf(r.createdAt) <= madeTo)
    .filter((r) => !endFrom || dateOf(r.endAt) >= endFrom)
    .filter((r) => !endTo || dateOf(r.endAt) <= endTo)
    .filter((r) => !titleCond || r.title.includes(titleCond))
    .filter((r) => !writerCond || (r.writerName ?? '').includes(writerCond))
    .filter((r) => !postNoCond || String(r.postNo).includes(postNoCond)),
    [rows, tab, keyword, scope, madeFrom, madeTo, endFrom, endTo,
      titleCond, writerCond, postNoCond])

  const tabCount = (t: Tab) => (t === '전체' ? rows.length : rows.filter((r) => r.status === TAB_STATUS[t]).length)

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
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
        // 2026-10-13 원본 하단은 [신규(F2)][Email][대화방][선택삭제] 뿐이다 — 예전에 둔 [미리보기] · [Excel] 은 뺐다.
        // [Email] 은 설문을 메일로 보내는 것이라 원본에서 눌러 보지 않았다(바깥으로 나감) — 두지 않는다.
        { label: '선택삭제', onClick: removeSelected, selected: selected.size },
      ]}
    >
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {/* 원본: 왼쪽 전체 · 초안 · 진행중 · 완료, 오른쪽 끝에 미발송. 건수는 붙지 않는다(2026-10-13 실측). */}
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}${t === '미발송' ? ' ml-auto' : ''}`}
                  title={`${tabCount(t)}건`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {/*
        원본 조건의 [설문대상구분]. 보기 이름도 원본 그대로다.
        <b>[결과공개범위]는 여기 있으면 안 된다.</b> 2026-09-08 에 원본(E070257)을 열어
        재 보니 조회 조건은 <b>여덟</b>이고(작성일 · 설문종료일 · 설문대상구분 · 제목 ·
        작성자 · 게시글번호 · 양식 · 적용양식) 그 안에 [결과공개범위]가 없다 —
        그건 <b>설문조사입력</b>(만드는 화면)의 칸이다. 대조표도 그렇게 적고 있었다.
        원본에 없는 것을 하나 더 두고 있었으므로 뺀다.
      */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 차례: <b>작성일 · 설문종료일</b> · 설문대상구분 · 제목 · 작성자 · 게시글번호 */}
        <EcCond label="작성일">
          <EcDateRange from={{ className: "ec-input", value: madeFrom, onChange: (e) => setMadeFrom(e.target.value) }} to={{ className: "ec-input", value: madeTo, onChange: (e) => setMadeTo(e.target.value) }} />
        </EcCond>
        <EcCond label="설문종료일">
          <EcDateRange from={{ className: "ec-input", value: endFrom, onChange: (e) => setEndFrom(e.target.value) }} to={{ className: "ec-input", value: endTo, onChange: (e) => setEndTo(e.target.value) }} />
        </EcCond>
        <EcCond label="설문대상구분">
          <div className="ec-pills">
            {([['', '전체'], ['INTERNAL', '내부'], ['EXTERNAL', '외부']] as const).map(([v, l]) => (
              <button key={l} type="button" className={`ec-pill no-ec${scope === v ? ' active' : ''}`}
                      onClick={() => setScope(v)}>{l}</button>
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

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-left">
        <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead>
          <tr>
            <th></th><th className="text-center">게시글번호</th><th className="text-center">작성일</th><th className="text-center">설문종료일</th><th>제목</th>
            <th className="text-center">작성자</th><th className="text-center">진행상태</th><th className="text-center">설문조사결과</th><th className="text-center">설문조사 참여여부</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td
                onClick={() => toggle(r.id)}
                title="눌러서 선택 (하단 [선택삭제])"
                style={{
                  textAlign: 'center', cursor: 'pointer',
                  background: selected.has(r.id) ? 'var(--ec-blue-light)' : 'var(--ec-report-stripe)',
                  color: selected.has(r.id) ? 'var(--ec-blue-dark)' : 'var(--ec-text-hint)',
                  fontWeight: selected.has(r.id) ? 700 : 400,
                }}
              >
                {i + 1}
              </td>
              {/* 원본(2026-10-13): 게시글번호 · 제목 · 작성자 · 보기 둘은 링크(--ec-link), 일시는 '오전/오후 h:mm:ss', 진행상태는 검정 글. */}
              <td className="text-center"><a className="cursor-pointer" onClick={() => setViewing(r)}>{r.postNo}</a></td>
              <td className="text-center">{dateTimeOf(r.createdAt)}</td>
              <td className="text-center">{dateTimeOf(r.endAt)}</td>
              <td><a className="cursor-pointer" onClick={() => setViewing(r)}>{r.title}</a></td>
              <td className="text-center"><a>{r.writerName ?? ''}</a></td>
              <td className="text-center">{r.statusName}</td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => void openResult(r)}>보기</a></td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => void openParticipants(r)}>보기</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      {viewing && (
        <ViewModal survey={viewing} onClose={() => setViewing(null)}
                   onResult={() => void openResult(viewing)}
                   onParticipants={() => void openParticipants(viewing)}
                   onFinish={() => void finishOne(viewing)}
                   onAnswer={() => { setAnswering(viewing); setViewing(null) }}
                   onEdit={() => navigate(`/groupware/survey-input?edit=${viewing.id}`)}
                   onCopy={() => navigate(`/groupware/survey-input?copy=${viewing.id}`)}
                   onDelete={() => void removeOne(viewing)}
                   onHistory={() => setHistory(viewing)} />
      )}
      {history && <HistoryModal survey={history} onClose={() => setHistory(null)} />}
      {participants && <ParticipantsModal rows={participants} onClose={() => setParticipants(null)} />}

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
      <div className="text-[13px]">
        {survey.headerText && (
          <div className="whitespace-pre-wrap border border-ec-line border-solid p-[10px] mb-[12px]">
            {survey.headerText}
          </div>
        )}
        {survey.anonymous && (
          <p className="text-ec-label text-[12px] mb-[10px]">
            익명 설문입니다 — 누가 답했는지 저장하지 않습니다.
          </p>
        )}

        {survey.questions.map((q) => (
          <div key={q.id} className="mb-[14px]">
            <div className="font-semibold mb-[4px]">
              {q.seq}. {q.content}
              {q.required && <span className="text-ec-danger ml-[4px]">*</span>}
            </div>

            {(q.type === 'SINGLE' || q.type === 'SINGLE_ETC') && q.options.map((o) => (
              <label key={o} className="block pl-[12px]">
                <input type="radio" name={`q${q.id}`} checked={(values[q.id] ?? [])[0] === o} onChange={() => set(q.id, [o])} /> {o}
              </label>
            ))}

            {(q.type === 'MULTI' || q.type === 'MULTI_ETC' || q.type === 'RANK') && q.options.map((o) => (
              <label key={o} className="block pl-[12px]">
                <input type="checkbox" checked={(values[q.id] ?? []).includes(o)} onChange={() => toggleMulti(q.id, o)} /> {o}
              </label>
            ))}

            {(q.type === 'SINGLE_ETC' || q.type === 'MULTI_ETC') && (
              <div className="pl-[12px] mt-[4px]">
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
              <EcDateInput className="ec-input" value={(values[q.id] ?? [])[0] ?? ''} onChange={(e) => set(q.id, e.target.value ? [e.target.value] : [])} />
            )}

            {q.type === 'SCALE' && (
              <div className="pl-[12px]">
                {['1', '2', '3', '4', '5'].map((n) => (
                  <label key={n} className="mr-[10px]">
                    <input type="radio" name={`q${q.id}`} checked={(values[q.id] ?? [])[0] === n} onChange={() => set(q.id, [n])} /> {n}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        {error && <p className="ec-alert ec-alert-danger">{error}</p>}
        <div className="mt-[10px]">
          <button className="ec-btn ec-btn-primary" onClick={() => void submit()}>제출</button>
          <button className="ec-btn" style={{ marginLeft: 4 }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * 원본 제목을 누르면 뜨는 '설문조사' 창(2026-10-13 실측) — 위 [설문대상자(35) 👤], 둥근 판(머리 --ec-bg-disabled '설문기간 : … ' + 머리말),
 * 질문마다 둥근 판(머리 질문 제목, 안에 보기). 하단 [설문결과보기][수정][복사][삭제][닫기].
 * 답할 수 있는 설문이면 [참여하기] 로 답하기 창을 연다(원본은 완료된 설문만 재서 답하는 단추 이름은 못 쟀다).
 * <b>진행 중</b>인 설문은 원본 하단이 [설문끝내기][설문여부][수정][복사][삭제][닫기][H] 다(2026-10-13 실측) — [설문결과보기] 자리에
 * [설문끝내기] · [설문여부](= '설문조사참여여부' 창)가 선다. 끝내면 [설문결과보기] 줄로 돌아온다.
 * 원본 작성자 창에는 답을 내는 단추가 없었다(보기 칸만 눌림) — 우리 [참여하기] 는 그대로 둔다.
 */
function ViewModal({ survey: r, onClose, onResult, onParticipants, onFinish, onAnswer, onEdit, onCopy, onDelete, onHistory }: {
  survey: SurveyDoc; onClose: () => void; onResult: () => void; onParticipants: () => void; onFinish: () => void; onAnswer: () => void
  onEdit: () => void; onCopy: () => void; onDelete: () => void; onHistory: () => void
}) {
  const canAnswer = r.status === 'OPEN' && !r.expired && !r.answeredByMe
  return (
    <Modal open title="설문조사" width={780} onClose={onClose}>
      <a className="cursor-pointer text-[12px]" onClick={onParticipants}>설문대상자({r.targetCount}) <EcIcon name="user" size={12} /></a>
      <div className="mt-[8px] mb-[12px] bg-ec-panel border border-ec-line border-solid rounded-[20px] overflow-hidden">
        <div className="bg-ec-disabled font-bold py-[10px] px-[9px]">{periodOf(r)}</div>
        <div className="whitespace-pre-wrap py-[10px] px-[9px] min-h-[24px]">{r.headerText ?? ''}</div>
      </div>
      {r.questions.map((q) => (
        <div key={q.id} className="mb-[12px] bg-ec-panel border border-ec-line border-solid rounded-[20px] overflow-hidden">
          <div className="bg-ec-disabled py-[10px] px-[9px]">{q.content}{q.required && <span className="text-ec-danger ml-[4px]">*</span>}</div>
          <div className="py-[10px] px-[18px]">
            {q.usesOptions ? q.options.map((o) => (
              <label key={o} className="flex items-center gap-[6px] py-[3px]">
                <input type={q.type === 'SINGLE' || q.type === 'SINGLE_ETC' ? 'radio' : 'checkbox'} disabled /> {o}
              </label>
            )) : <span className="text-ec-hint">{q.typeName}</span>}
          </div>
        </div>
      ))}
      <div className="flex gap-[6px] mt-[10px]">
        {r.status === 'OPEN' ? (
          <>
            <button type="button" className="ec-btn ec-btn-primary" onClick={onFinish}>설문끝내기</button>
            <button type="button" className="ec-btn" onClick={onParticipants}>설문여부</button>
          </>
        ) : <button type="button" className="ec-btn ec-btn-primary" onClick={onResult}>설문결과보기</button>}
        {canAnswer && <button type="button" className="ec-btn" onClick={onAnswer}>참여하기</button>}
        <button type="button" className="ec-btn" onClick={onEdit}>수정</button>
        <button type="button" className="ec-btn" onClick={onCopy}>복사</button>
        <button type="button" className="ec-btn" onClick={onDelete}>삭제</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        <button type="button" className="ec-btn" onClick={onHistory}>H</button>
      </div>
    </Modal>
  )
}

/**
 * 원본 '설문조사' 창 [H] 의 '이력'(2026-10-13 실측) — '게시글번호 : 22', 격자 [순번][작업자ID][작업일시][상태], 하단 [닫기].
 * 원본 22번은 '1 · GUEST · 2026/09/23 오전 9:57:09 · 신규' 한 줄이었다. 우리는 고친 사람을 남기지 않아 '신규' 줄만 그린다.
 */
function HistoryModal({ survey: r, onClose }: { survey: SurveyDoc; onClose: () => void }) {
  return (
    <Modal open title="이력" width={780} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[12px]">이력</div>
      <div className="text-[12px] mb-[6px]">게시글번호 : {r.postNo}</div>
      <table className="w-full">
        <thead><tr><th>순번</th><th>작업자ID</th><th>작업일시</th><th>상태</th></tr></thead>
        <tbody>
          <tr><td>1</td><td className="text-ec-navy">{r.createdBy}</td><td>{dateTimeOf(r.createdAt)}</td><td className="text-ec-navy">신규</td></tr>
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[10px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 원본 '설문조사참여여부' — [소속부서][성명][ID][참여여부 O/X], 하단 [닫기]. */
function ParticipantsModal({ rows, onClose }: { rows: Participant[]; onClose: () => void }) {
  return (
    <Modal open title="설문조사참여여부" width={780} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[12px]">설문조사참여여부</div>
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full table-fixed text-left">
          <thead><tr><th>소속부서</th><th>성명</th><th>ID</th><th>참여여부</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((p) => (
              <tr key={p.username}><td>{p.department ?? ''}</td><td>{p.name}</td><td>{p.username}</td><td>{p.participated ? 'O' : 'X'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[6px] mt-[10px]"><button type="button" className="ec-btn" onClick={onClose}>닫기</button></div>
    </Modal>
  )
}

/**
 * 원본 '설문조사 결과보기'(2026-10-13 실측) — 둥근 판: 머리(--ec-bg-disabled) '요약' · 설문대상자수 · 설문응답자수 · 설문미응답자수, 아래 머리말.
 * 질문마다 제목 줄 + 격자 [항목][응답자수][응답비율 0.00%][전체응답자수(칸 합침, 'N명')]. 서술형은 답 원문 줄.
 * 하단 [인쇄▲(PDF · 미리보기 · 프린트문제해결)][Excel][닫기] — 우리는 인쇄 · PDF(인쇄 대화상자에서 PDF 로 저장) · 미리보기 · Excel 을 둔다.
 * [프린트문제해결]은 이카운트 도움말 창이라 두지 않았다.
 */
function ResultModal({ result, onClose }: { result: SurveyResult; onClose: () => void }) {
  const [printMenu, setPrintMenu] = useState(false)
  const pct = (n: number, all: number) => `${(all ? (n * 100) / all : 0).toFixed(2)}%`
  /** 판 그대로 인쇄창에 옮긴다 — 요약 · 질문마다 격자. */
  const print = (autoPrint: boolean) => {
    const e = escapeHtml
    const body = result.questions.map((q) => {
      const opts = Object.entries(q.counts)
      const rows = opts.length === 0
        ? (q.texts.length === 0 ? [`<tr><td colspan="3">&nbsp;</td><td>${q.answeredCount}명</td></tr>`]
          : q.texts.map((t, i) => `<tr><td colspan="3">${e(t)}</td>${i === 0 ? `<td rowspan="${q.texts.length}">${q.answeredCount}명</td>` : ''}</tr>`))
        : opts.map(([o, n], i) => `<tr><td>${e(o)}</td><td>${n}</td><td>${pct(n, q.answeredCount)}</td>${i === 0 ? `<td rowspan="${opts.length}">${q.answeredCount}명</td>` : ''}</tr>`)
      return `<p>${e(q.content)}</p><table><thead><tr><th>항목</th><th>응답자수</th><th>응답비율</th><th>전체응답자수</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
    }).join('')
    printHtml(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>설문조사 결과보기</title>`
      + `<style>body{font-family:sans-serif;font-size:12px;padding:16px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid;padding:4px 6px;text-align:left}</style></head>`
      + `<body><h3>설문조사 결과보기</h3><p><b>요약</b><br>설문대상자수 : ${result.targetCount}<br>설문응답자수 : ${result.responseCount}<br>`
      + `설문미응답자수 : ${Math.max(0, result.targetCount - result.responseCount)}</p>${body}</body></html>`, { autoPrint })
  }
  /** [Excel] — 질문마다의 격자를 한 장에: 질문 · 항목 · 응답자수 · 응답비율 · 전체응답자수. */
  const excel = () => void matrixToXlsx({
    headers: ['질문', '항목', '응답자수', '응답비율', '전체응답자수'],
    rows: result.questions.flatMap((q) => {
      const opts = Object.entries(q.counts)
      if (opts.length === 0) return (q.texts.length ? q.texts : ['']).map((t) => [q.content, t, '', '', `${q.answeredCount}명`])
      return opts.map(([o, n]) => [q.content, o, n, pct(n, q.answeredCount), `${q.answeredCount}명`])
    }),
  }, '설문조사 결과보기')
  return (
    <Modal open title="설문조사 결과보기" width={780} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[8px]">설문조사 결과보기</div>
      <div className="mb-[10px] bg-ec-panel border border-ec-line border-solid rounded-[20px] overflow-hidden">
        <div className="bg-ec-disabled py-[8px] px-[9px] leading-[22px]">
          <div className="font-bold">요약</div>
          <div>설문대상자수 : {result.targetCount}</div>
          <div>설문응답자수 : {result.responseCount}</div>
          <div>설문미응답자수 : {Math.max(0, result.targetCount - result.responseCount)}</div>
        </div>
      </div>
      {result.questions.map((q) => {
        const opts = Object.entries(q.counts)
        return (
          <div key={q.questionId} className="mb-[12px]">
            <div className="mb-[6px]">{q.content}</div>
            <table className="w-full table-fixed text-left">
              <thead><tr><th>항목</th><th>응답자수</th><th>응답비율</th><th>전체응답자수</th></tr></thead>
              <tbody>
                {opts.length === 0 ? (
                  q.texts.length === 0
                    ? <tr><td colSpan={3}>&nbsp;</td><td>{q.answeredCount}명</td></tr>
                    : q.texts.map((t, i) => (
                      <tr key={i}><td colSpan={3}>{t}</td>{i === 0 && <td rowSpan={q.texts.length}>{q.answeredCount}명</td>}</tr>
                    ))
                ) : opts.map(([opt, n], i) => (
                  <tr key={opt}>
                    <td>{opt}</td><td>{n}</td>
                    <td>{pct(n, q.answeredCount)}</td>
                    {i === 0 && <td rowSpan={opts.length}>{q.answeredCount}명</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
      <div className="flex gap-[6px] mt-[10px]">
        <span className="ec-btn-group relative">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => print(true)}>인쇄</button>
          <button type="button" className="ec-btn ec-btn-primary ec-btn-arrow" aria-label="인쇄 펼치기" onClick={() => setPrintMenu((m) => !m)}><EcIcon name="caret-up" size={10} glyph="▴" /></button>
          {printMenu && (
            <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[110px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
              <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                      onClick={() => { setPrintMenu(false); print(true) }}>PDF</button>
              <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                      onClick={() => { setPrintMenu(false); print(false) }}>미리보기</button>
            </div>
          )}
        </span>
        <button type="button" className="ec-btn" onClick={excel}>Excel</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
