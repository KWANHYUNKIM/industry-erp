import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { STATUS_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportPeriod, reportDate } from '../../components/EcReportFrame'
import type { SurveyDoc } from '../../types/api'
import { useShortcut } from '../../utils/useShortcut'
import { useTableSort } from '../../utils/useTableSort'

/**
 * 그룹웨어 > 공유정보 > 설문조사 > 설문조사현황 (이카운트 E070258)
 *
 * <p><b>2026-10-03 원본을 열어 다시 맞췄다.</b> 원본은 두 판이다.
 * <ol>
 *   <li><b>조건 판</b> — 작성일(기본 <b>전월 1일 ~ 오늘</b>, 2026/09/01 ~ 2026/10/03) · 설문대상구분(전체/내부/외부) ·
 *       설문종료일(사용) · 제목(포함) · 질문내용(포함) · 작성자 · 게시글번호(포함) · 양식(적용양식 기본(수정불가)).
 *       아래 줄 [검색(F8)] 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 전월+금월 … [다시 작성].</li>
 *   <li><b>출력물</b> — 가운데 큰 제목 · '회사명 : …' · 기간, 격자 [작성일▼][게시글번호▼][설문종료일▼][설문대상자]
 *       [제목][질문내용][응답내용], 아래 [P.1] 과 출력 시각, 하단 [인쇄][Excel]. 제목 줄의 [Search(F3)] 로 조건 판에 돌아간다.</li>
 * </ol>
 *
 * <p>우리는 조건과 <b>설문 한 줄짜리 표</b>(대상수·응답수·응답률)를 한 화면에 늘어놓고, 원본 격자는 줄을 눌러야
 * 그 설문 하나만 폈다. 원본 격자는 <b>응답 × 질문 하나가 한 줄</b>이다 — 이제 검색하면 고른 설문들의 응답을
 * 그 모양으로 바로 편다. 응답이 없는 설문은 줄이 없다(loginaa 자료가 0건이라 원본에서 확인은 못 했다).
 *
 * <p>원본 조건에 없던 우리 것([진행] 라디오, 정렬/소계 알약과 소계 표)은 뺐다. 원본 [정렬/소계기준 설정] ·
 * [종료일] 빠른선택 · 적용양식 바꾸기는 받쳐 줄 것이 없어 두지 않았다.
 */

interface UserRow { id: number; name: string; username: string }

/** 응답 한 건 — GET /surveys/{id}/responses. 익명 설문이면 이름이 비어 온다(저장 자체가 비어 있다). */
interface ResponseDetail {
  id: number
  respondentName: string | null
  submittedAt: string
  answersByQuestionId: Record<string, string[]>
}

interface Line {
  key: string; createdAt: string; postNo: number; endAt: string
  respondent: string; title: string; question: string; answer: string
}

/**
 * 원본 기본 기간은 [전월+금월]인데, 이 화면에서는 <b>오늘에서 끊긴다</b> — 2026-10-03 원본이 기본값도,
 * [전월+금월]을 눌러도 '2026/09/01 ~ 2026/10/03' 이다(작성일이라 아직 안 온 날은 볼 것이 없다).
 * 공용 periodOf 는 다른 화면을 위해 금월 말일까지라 여기서만 오늘로 자른다.
 */
function initPeriod() {
  const p = periodOf('전월+금월')!
  const today = ymd(new Date())
  return { from: p.from, to: p.to > today ? today : p.to }
}

export default function SurveyStatusPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [view, setView] = useState<'cond' | 'result'>('cond')
  const [lines, setLines] = useState<Line[]>([])

  const [from, setFrom] = useState(() => initPeriod().from)
  const [to, setTo] = useState(() => initPeriod().to)
  const [scope, setScope] = useState<'' | 'INTERNAL' | 'EXTERNAL'>('')
  const [useEnd, setUseEnd] = useState(false)
  /* 원본 [설문종료일 사용]을 켜면 작성일과 같은 구간으로 펴진다(실측). */
  const [endFrom, setEndFrom] = useState(() => initPeriod().from)
  const [endTo, setEndTo] = useState(() => initPeriod().to)
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [writer, setWriter] = useState('')
  const [postNo, setPostNo] = useState('')

  useEffect(() => {
    api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  function reset() {
    const p = initPeriod(); setFrom(p.from); setTo(p.to)
    setScope(''); setUseEnd(false); setTitle(''); setQuestion(''); setWriter(''); setPostNo('')
  }

  /** [검색(F8)] — 조건에 맞는 설문을 고르고, 그 설문들의 응답을 응답 × 질문 한 줄씩 편다. */
  async function search() {
    setError('')
    try {
      const all = (await api.get<SurveyDoc[]>('/surveys')).data
      const writerName = users.find((u) => String(u.id) === writer)?.name
      const picked = all.filter((r) => {
        const created = (r.createdAt ?? '').slice(0, 10)
        if (created && (created < from || created > to)) return false
        if (scope && r.targetScope !== scope) return false
        if (useEnd) {
          const end = (r.endAt ?? '').slice(0, 10)
          if (!end || end < endFrom || end > endTo) return false
        }
        if (title && !r.title.includes(title)) return false
        if (question && !r.questions.some((q) => q.content.includes(question))) return false
        if (writerName && r.writerName !== writerName) return false
        if (postNo && !String(r.postNo).includes(postNo)) return false
        return true
      })
      const out: Line[] = []
      for (const sv of picked) {
        let detail: ResponseDetail[] = []
        // 결과공개범위에 막힌 설문(403)은 줄을 못 낸다 — 다른 설문까지 멈추지 않게 건너뛴다.
        try { detail = (await api.get<ResponseDetail[]>(`/surveys/${sv.id}/responses`)).data } catch { continue }
        for (const d of detail) {
          for (const q of sv.questions) {
            const qs = question ? q.content.includes(question) : true
            if (!qs) continue
            out.push({
              key: `${sv.id}-${d.id}-${q.id}`,
              createdAt: reportDate(sv.createdAt), postNo: sv.postNo, endAt: reportDate(sv.endAt),
              respondent: d.respondentName ?? '(익명)',
              title: sv.title, question: q.content,
              answer: (d.answersByQuestionId[String(q.id)] ?? []).join(', '),
            })
          }
        }
      }
      setLines(out)
      setView('result')
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  useShortcut('F8', () => void search(), view === 'cond')

  const sort = useTableSort(lines, {
    작성일: (l) => l.createdAt,
    게시글번호: (l) => l.postNo,
    설문종료일: (l) => l.endAt,
  })

  return (
    <EcListShell
      title="설문조사현황"
      searchable={view === 'result'}
      onSearch={() => setView('cond')}
      actions={view === 'result' ? [{ label: '인쇄' }, { label: 'Excel' }] : []}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {view === 'cond' ? (
        <div>
          <ul className="ec-form">
            <li className="wide">
              <div className="title">작성일</div>
              <div className="form">
                <input type="date" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-ec-label">~</span>
                <input type="date" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </li>
            <li className="wide">
              <div className="title">설문대상구분</div>
              <div className="form">
                {([['', '전체'], ['INTERNAL', '내부'], ['EXTERNAL', '외부']] as const).map(([v, l]) => (
                  <label key={l} className="mr-[12px] text-[12px] inline-flex items-center gap-[4px]">
                    <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} /> {l}
                  </label>
                ))}
              </div>
            </li>
            <li className="wide">
              <div className="title">설문종료일</div>
              <div className="form">
                {useEnd && (
                  <>
                    <input type="date" className="ec-input w-[140px]" value={endFrom} onChange={(e) => setEndFrom(e.target.value)} />
                    <span className="text-ec-label">~</span>
                    <input type="date" className="ec-input w-[140px]" value={endTo} onChange={(e) => setEndTo(e.target.value)} />
                  </>
                )}
                <label className="text-[12px] inline-flex items-center gap-[4px]">
                  <input type="checkbox" checked={useEnd} onChange={(e) => setUseEnd(e.target.checked)} /> 사용
                </label>
              </div>
            </li>
            <li className="wide">
              <div className="title">제목</div>
              <div className="form"><input className="ec-input flex-1" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
                <span className="text-[12px] text-ec-label">포함</span></div>
            </li>
            <li className="wide">
              <div className="title">질문내용</div>
              <div className="form"><input className="ec-input flex-1" placeholder="질문내용" value={question} onChange={(e) => setQuestion(e.target.value)} />
                <span className="text-[12px] text-ec-label">포함</span></div>
            </li>
            <li className="wide">
              <div className="title">작성자</div>
              <div className="form">
                <CodePickerField label="작성자" hideLabel value={writer} onChange={setWriter}
                                 items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))} />
              </div>
            </li>
            <li className="wide">
              <div className="title">게시글번호</div>
              <div className="form"><input className="ec-input flex-1" placeholder="게시글번호" value={postNo} onChange={(e) => setPostNo(e.target.value)} />
                <span className="text-[12px] text-ec-label">포함</span></div>
            </li>
            <li className="wide">
              <div className="title">적용양식</div>
              <div className="form"><select className="ec-input flex-1" value="기본" disabled><option value="기본">기본(수정불가)</option></select></div>
            </li>
            {/* 원본 [정렬/소계기준 설정]은 창을 띄워 고른다. 우리는 소계가 없어 정렬만 고른다 — 출력물 머리의 ▲▼ 와 같이 움직인다. */}
            <li className="wide">
              <div className="title">정렬/소계기준</div>
              <div className="form">
                <select className="ec-input w-[160px]" aria-label="정렬기준" value={sort.sortKey ?? ''}
                        onChange={(e) => sort.setSort(e.target.value || null)}>
                  <option value="">(기본)</option>
                  <option value="작성일">작성일</option>
                  <option value="게시글번호">게시글번호</option>
                  <option value="설문종료일">설문종료일</option>
                </select>
              </div>
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            <EcPeriodPicks labels={STATUS_PICKS} currentFrom={from}
                           onPick={(r) => { if (r.from) setFrom(r.from); const t = ymd(new Date()); setTo(r.to > t ? t : r.to) }} />
            <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          </div>
        </div>
      ) : (
        <>
          <EcReportHead title="설문조사현황" period={reportPeriod(from, to)} />
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('작성일')}>작성일 {sort.mark('작성일')}</th>
                <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('게시글번호')}>게시글번호 {sort.mark('게시글번호')}</th>
                <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('설문종료일')}>설문종료일 {sort.mark('설문종료일')}</th>
                <th>설문대상자</th><th>제목</th><th>질문내용</th><th>응답내용</th>
              </tr>
            </thead>
            <tbody>
              {sort.sorted.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : sort.sorted.map((l) => (
                <tr key={l.key}>
                  <td>{l.createdAt}</td><td>{l.postNo}</td><td>{l.endAt}</td>
                  <td>{l.respondent}</td><td>{l.title}</td><td>{l.question}</td><td>{l.answer}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}
