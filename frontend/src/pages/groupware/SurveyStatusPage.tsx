import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
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

export default function SurveyStatusPage() {
  const [rows, setRows] = useState<SurveyDoc[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const today = new Date()
  const [from, setFrom] = useState(ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
  const [to, setTo] = useState(ymd(today))
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
            <th></th><th>게시글번호</th><th>작성일</th><th>설문종료일</th><th>제목</th>
            <th>작성자</th><th>대상구분</th><th>대상수</th><th>응답수</th><th>응답률</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>
              {searched ? '조건에 맞는 데이터가 없습니다.' : '등록된 데이터가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
              <td style={{ textAlign: 'center' }}>{r.postNo}</td>
              <td style={{ textAlign: 'center' }}>{(r.createdAt ?? '').slice(0, 10).replace(/-/g, '/')}</td>
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
