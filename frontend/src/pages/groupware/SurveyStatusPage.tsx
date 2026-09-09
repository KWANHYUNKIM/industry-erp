import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { STATUS_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import type { SurveyDoc } from '../../api/types'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 그룹웨어 > 공유정보 > 설문조사 > 설문조사현황 (이카운트 E070258)
 *
 * 원본은 목록이 아니라 <b>조회 조건 패널 + 검색(F8)</b> 화면이다. 조건은
 * 작성일(기간) · 설문대상구분 · 설문종료일(사용 여부) · 제목(포함) · 질문내용(포함) ·
 * 작성자 · 게시글번호(포함) 이고, 하단은 [검색(F8)][다시 작성][인쇄][Excel].
 *
 * '질문내용 포함'은 설문 안의 문항 글자로 설문을 찾는 조건이다 — 문항이 실제로 저장되기 전에는
 * 만들 수 없던 조건이라, 이번에 문항을 만들면서 같이 붙였다.
 *
 * 예전 이 화면은 '응답+1' 버튼으로 응답 수 정수를 올리는 화면이었다. 그건 설문 현황이 아니다.
 */

interface UserRow { id: number; name: string; username: string }

/**
 * 응답 한 건. <code>GET /surveys/{id}/responses</code> 가 준다 —
 * 이번에 자리를 열었다(<code>ResponseDetailDto</code> 는 진작 만들어져 있었는데
 * <b>어떤 컨트롤러도 안 내주고 있었다</b>).
 * 익명 설문이면 <code>respondentName</code> 이 비어 온다 — 저장 자체가 비어 있다.
 */
interface ResponseDetail {
  id: number
  respondentName: string | null
  submittedAt: string
  answersByQuestionId: Record<string, string[]>
}

export default function SurveyStatusPage() {
  const [rows, setRows] = useState<SurveyDoc[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  /*
   * 펼쳐 놓은 설문과 그 응답. 목록 줄마다 미리 부르지 않는다 —
   * 설문이 수십 건이면 그만큼 요청이 나가고(N+1), 대부분은 안 펼쳐 볼 것이다.
   */
  const [openId, setOpenId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ResponseDetail[]>([])
  const [detailErr, setDetailErr] = useState('')

  async function openDetail(id: number) {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id); setDetail([]); setDetailErr('')
    try {
      setDetail((await api.get<ResponseDetail[]>(`/surveys/${id}/responses`)).data)
    } catch (err) {
      /* 결과공개범위에 막히면 403 이 온다 — 빈 표 대신 왜 못 보는지를 적는다. */
      setDetailErr(extractErrorMessage(err))
    }
  }

  const today = new Date()
  /*
   * 원본 설문조사현황의 기간 기본값은 <b>[전월+금월]</b>(실측)이다. 손으로 전월 1일~오늘 을
   * 잡아 두었더니 <b>이달 안에 시작하는 설문</b>이 열자마자 빠졌다 — 아직 안 온 날짜라서다.
   * periodOf 로 잡아 금월 말일까지 본다.
   */
  const initPeriod = periodOf('전월+금월')!
  const [from, setFrom] = useState(initPeriod.from)
  const [to, setTo] = useState(initPeriod.to)
  const [scope, setScope] = useState<'' | 'INTERNAL' | 'EXTERNAL'>('')
  /*
   * 원본 [진행] — <b>전체 · 진행중 · 완료</b>(사본 실측). 우리는 없었다.
   * 설문에 따로 상태를 두지 않으니 <b>설문종료일이 지났는지</b>로 가른다 —
   * 종료일이 없는 설문은 끝나지 않은 것으로 본다.
   */
  const [progress, setProgress] = useState<'전체' | '진행중' | '완료'>('전체')
  const [useEnd, setUseEnd] = useState(false)
  const [endFrom, setEndFrom] = useState(ymd(today))
  const [endTo, setEndTo] = useState(ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)))
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [writer, setWriter] = useState('')
  const [postNo, setPostNo] = useState('')

  async function load() {
    setError('')
    try { setRows((await api.get<SurveyDoc[]>('/surveys')).data); setSearched(true) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  useEffect(() => {
    api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  function reset() {
    setFrom(ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
    setTo(ymd(today))
    setScope(''); setUseEnd(false); setTitle(''); setQuestion(''); setWriter(''); setPostNo('')
  }

  /*
   * 원본 [정렬/소계기준]. 설문이 쌓이면 <b>누가 얼마나 냈고 응답이 얼마나 왔는지</b>를
   * 눈으로 모아야 했다.
   */
  const SUBTOTALS = ['작성자', '설문대상구분', '진행상태'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('작성자')

  const shown = useMemo(() => {
    const writerName = users.find((u) => String(u.id) === writer)?.name
    return rows.filter((r) => {
      const created = (r.createdAt ?? '').slice(0, 10)
      if (created && (created < from || created > to)) return false
      if (scope && r.targetScope !== scope) return false
      if (progress !== '전체') {
        const end = (r.endAt ?? '').slice(0, 10)
        const done = !!end && end < ymd(new Date())
        if (progress === '진행중' && done) return false
        if (progress === '완료' && !done) return false
      }
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
  }, [rows, from, to, scope, progress, useEnd, endFrom, endTo, title, question, writer, postNo, users])

  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 110 }
  /**
   * <b>원본 격자의 줄</b> — 펼친 설문의 <b>응답 × 질문</b> 하나가 한 줄이다.
   * 설문 머리(작성일·게시글번호·설문종료일·제목)는 줄마다 되풀이된다 — 원본이 그렇다.
   */
  const detailRows = useMemo(() => {
    const sv = rows.find((r) => r.id === openId)
    if (!sv) return []
    const dot = (d: string | null) => (d ?? '').slice(0, 10).replace(/-/g, '/')
    const out: {
      key: string; createdAt: string; postNo: number; endAt: string
      respondent: string; title: string; question: string; answer: string
    }[] = []
    for (const d of detail) {
      for (const q of sv.questions) {
        const vals = d.answersByQuestionId[String(q.id)] ?? []
        out.push({
          key: `${d.id}-${q.id}`,
          createdAt: dot(sv.createdAt), postNo: sv.postNo, endAt: dot(sv.endAt),
          /* 익명이면 서버에 이름이 없다 — 화면에서 가리는 것이 아니다. */
          respondent: d.respondentName ?? '(익명)',
          title: sv.title, question: q.content,
          answer: vals.join(', '),
        })
      }
    }
    return out
  }, [rows, openId, detail])

  const totals = shown.reduce((a, r) => ({
    targets: a.targets + r.targetCount,
    responses: a.responses + r.responseCount,
  }), { targets: 0, responses: 0 })

  return (
    <EcListShell
      title="설문조사현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {/* 조회 조건 — 원본은 이 패널이 화면의 본체다 */}
      <table className="w-full text-left" style={{ marginBottom: 10 }}>
        <tbody>
          <tr>
            <th style={th}>작성일</th>
            <td>
              <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
              {/*
                원본 설문조사현황의 버튼줄에 <b>[전월+금월]</b> 이 있다(사본 실측).
                예전에는 '기간 빠른선택에 그 조합을 두지 않았다' 고 적고 뺐는데,
                <b>그 조합은 진작 만들어져 있었다</b>(STATUS_PICKS) — 이 화면만 날짜를
                손으로 찍게 두고 있었다. 다른 조회 화면과 같은 줄을 쓴다.
              */}
              <span style={{ marginLeft: 8, display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}>
                <EcPeriodPicks labels={STATUS_PICKS} currentFrom={from}
                               onPick={(r) => { if (r.from) setFrom(r.from); setTo(r.to) }} />
              </span>
            </td>
            <th style={th}>설문대상구분</th>
            <td>
              {([['', '전체'], ['INTERNAL', '내부'], ['EXTERNAL', '외부']] as const).map(([v, l]) => (
                <label key={l} style={{ marginRight: 12, fontSize: 12 }}>
                  <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} /> {l}
                </label>
              ))}
            </td>
          </tr>
          <tr>
            {/* 원본 [진행] — 설문종료일이 지났으면 완료로 본다. */}
            <th style={th}>진행</th>
            <td colSpan={3}>
              {(['전체', '진행중', '완료'] as const).map((t) => (
                <label key={t} style={{ marginRight: 12, fontSize: 12 }}>
                  <input type="radio" name="progress" checked={progress === t} onChange={() => setProgress(t)} /> {t}
                </label>
              ))}
            </td>
          </tr>
          <tr>
            <th style={th}>설문종료일</th>
            <td colSpan={3}>
              <label style={{ fontSize: 12, marginRight: 8 }}>
                <input type="checkbox" checked={useEnd} onChange={(e) => setUseEnd(e.target.checked)} /> 사용
              </label>
              <input type="date" className="ec-input" value={endFrom} disabled={!useEnd}
                onChange={(e) => setEndFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className="ec-input" value={endTo} disabled={!useEnd}
                onChange={(e) => setEndTo(e.target.value)} style={{ width: 140 }} />
            </td>
          </tr>
          <tr>
            <th style={th}>제목</th>
            <td>
              <input className="ec-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 220 }} />
              <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ec-label)' }}>포함</span>
            </td>
            <th style={th}>질문내용</th>
            <td>
              <input className="ec-input" value={question} onChange={(e) => setQuestion(e.target.value)} style={{ width: 220 }} />
              <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ec-label)' }}>포함</span>
            </td>
          </tr>
          <tr>
            <th style={th}>작성자</th>
            <td>
              <CodePickerField
                label="작성자" hideLabel value={writer} onChange={setWriter}
                items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))}
              />
            </td>
            <th style={th}>게시글번호</th>
            <td>
              <input className="ec-input" value={postNo} onChange={(e) => setPostNo(e.target.value)} style={{ width: 120 }} />
              <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ec-label)' }}>포함</span>
            </td>
          </tr>
          <tr>
            {/* 원본 [정렬/소계기준]. 조건 판의 아래쪽 줄이다(사본 실측). */}
            <th style={th}>정렬/소계기준</th>
            <td colSpan={3}>
              <div className="ec-pills">
                {SUBTOTALS.map((v) => (
                  <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                          onClick={() => setSubtotal(v)}>{v}</button>
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <colgroup>
          <col style={{ width: '4%' }} /><col style={{ width: '9%' }} /><col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} /><col /><col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
          <col style={{ width: '9%' }} />
        </colgroup>
        <thead>
          <tr>
            {/*
              <b>설문조사현황(E070258) 2026-09-09 원본 격자 실측</b> — 열 일곱이 아니라
              일곱 칸이다: [작성일 · 게시글번호 · 설문종료일 · <b>설문대상자</b> · 제목 ·
              <b>질문내용</b> · <b>응답내용</b>].
              원본은 <b>응답 한 줄이 한 줄</b>이다(설문 × 질문 × 응답자). 우리 표는
              <b>설문 한 줄</b>이라 대상수·응답수·응답률을 낸다 — 축이 다르다.
              이번에 고친 것은 <b>차례</b>다: 원본은 [작성일]이 먼저고 [게시글번호]가 뒤인데
              우리는 반대였다. 나머지 셋([설문대상자]·[질문내용]·[응답내용])은
              못 만드는 것이 아니라 아직 안 만든 것이라 pending-columns.json 에 적었다
              (SurveyDoc 이 questions·targets 를 이미 들고 온다).
            */}
            <th></th><th style={{ textAlign: 'center' }}>작성일</th><th style={{ textAlign: 'center' }}>게시글번호</th><th style={{ textAlign: 'center' }}>설문종료일</th><th>제목</th>
            <th style={{ textAlign: 'center' }}>작성자</th><th style={{ textAlign: 'center' }}>대상구분</th><th style={{ textAlign: 'right' }}>대상수</th><th style={{ textAlign: 'right' }}>응답수</th><th style={{ textAlign: 'right' }}>응답률</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>
              {searched ? '조건에 맞는 데이터가 없습니다.' : '등록된 데이터가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id} onClick={() => openDetail(r.id)} style={{ cursor: 'pointer' }}>
              <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
              <td style={{ textAlign: 'center' }}>{(r.createdAt ?? '').slice(0, 10).replace(/-/g, '/')}</td>
              <td style={{ textAlign: 'center' }}>{r.postNo}</td>
              <td style={{ textAlign: 'center' }}>{(r.endAt ?? '').slice(0, 10).replace(/-/g, '/')}</td>
              <td>{r.title}</td>
              <td style={{ textAlign: 'center' }}>{r.writerName ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{r.targetScopeName}</td>
              <td style={{ textAlign: 'right' }}>{r.targetCount.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.responseCount.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.responseRate}%</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{totals.targets.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{totals.responses.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                {totals.targets > 0 ? Math.round((totals.responses * 100) / totals.targets) : 0}%
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/*
        <b>원본 설문조사현황(E070258)의 격자</b>. 원본은 <b>응답 한 줄이 한 줄</b>이라
        [작성일 · 게시글번호 · 설문종료일 · <b>설문대상자</b> · 제목 · <b>질문내용</b> ·
        <b>응답내용</b>] 일곱 칸을 나란히 놓는다(설문 × 질문 × 응답자).
        위 표는 <b>설문 한 줄</b>이라 대상수·응답수·응답률을 내는 <b>우리 표</b>다 —
        축이 다르니 지우지 않고 둘 다 둔다.

        <p><b>목록 전체를 이 축으로 펴지 않는 이유:</b> 응답 원문은 설문마다 따로 받아야 해서
        줄마다 부르면 요청이 설문 수만큼 나간다(N+1). 그래서 <b>고른 설문 하나</b>만 편다 —
        위 표의 줄을 누르면 그 설문의 응답이 여기 원본 차례 그대로 선다.

        <p>[설문대상자]는 <b>답한 사람</b>이다(원본 칸 이름이 대상자다). 익명 설문이면
        서버에 이름이 <b>저장되어 있지 않아</b> (익명)으로 적는다 — 가리는 것이 아니라 없다.
      */}
      {openId != null && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>
            응답 내역 {detail.length > 0 && `(${detail.length}건)`}
          </h3>
          {detailErr ? (
            <p style={{ color: '#c60a2e', fontSize: 12.5, margin: '0 0 10px' }}>{detailErr}</p>
          ) : (
            <table className="w-full text-left" style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th style={{ width: 100, textAlign: 'center' }}>작성일</th>
                  <th style={{ width: 90, textAlign: 'center' }}>게시글번호</th>
                  <th style={{ width: 100, textAlign: 'center' }}>설문종료일</th>
                  <th style={{ width: 110, textAlign: 'center' }}>설문대상자</th>
                  <th style={{ width: 180 }}>제목</th>
                  <th>질문내용</th>
                  <th>응답내용</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>
                    아직 응답이 없습니다.
                  </td></tr>
                ) : detailRows.map((d) => (
                  <tr key={d.key}>
                    <td style={{ textAlign: 'center' }}>{d.createdAt}</td>
                    <td style={{ textAlign: 'center' }}>{d.postNo}</td>
                    <td style={{ textAlign: 'center' }}>{d.endAt}</td>
                    <td style={{ textAlign: 'center' }}>{d.respondent}</td>
                    <td>{d.title}</td>
                    <td>{d.question}</td>
                    <td>{d.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {shown.length > 0 && (() => {
        const groups = subtotalBy(shown,
          (r) => (subtotal === '설문대상구분' ? r.targetScopeName
            : subtotal === '진행상태' ? r.statusName : r.writerName),
          { targets: (r) => r.targetCount, responses: (r) => r.responseCount })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>설문수</th>
                <th style={{ width: 110, textAlign: 'right' }}>대상</th>
                <th style={{ width: 110, textAlign: 'right' }}>응답</th>
                <th style={{ width: 110, textAlign: 'right' }}>응답률</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.sums.targets.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.sums.responses.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                      {g.sums.targets > 0 ? Math.round((g.sums.responses * 100) / g.sums.targets) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
