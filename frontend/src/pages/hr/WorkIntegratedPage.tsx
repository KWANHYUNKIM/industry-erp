import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { useAuth } from '../../auth/AuthContext'
import { dateText } from '../../utils/dateText'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 관리 > 출퇴근/근태/일정 통합현황 (이카운트 E070315)
 * 기간 동안 사원별·일자별로 근태(출근/퇴근/상태)와 그날 일정을 한 줄에 합쳐 보는 통합 뷰.
 * 근태(사원명)와 일정(담당명)을 이름+일자로 매칭한다. 근태만/일정만 있는 날도 각각 한 줄로 나온다.
 * 백엔드 무변경 — `/api/hr/attendance?from&to` + `/api/schedule-events` 조합(프론트 병합).
 */
interface AttendanceRow {
  id: number; date: string; empName: string; department: string | null
  clockIn: string | null; clockOut: string | null; workHours: number; status: string; note: string | null
}
interface ScheduleEvent {
  id: number; eventDate: string; startTime: string | null; title: string; category: string | null; owner: string | null
  /** 원본 조건 [공유여부]·[프로젝트]. 일정에 담을 자리가 없어 두 조건을 만들 수가 없었다. */
  shared: boolean; projectId: number | null; projectName: string | null
}
interface MergedRow {
  key: string; date: string; name: string; department: string | null
  clockIn: string | null; clockOut: string | null; status: string | null
  /** 원본 조건 [적요] — 근태에 적어 둔 메모다(응답의 note). */
  note: string | null
  events: { title: string; category: string | null; startTime: string | null }[]
  /** 그 줄에 걸린 일정의 공유 여부와 프로젝트 이름들 — 거르는 데 쓴다. */
  hasShared: boolean; hasPrivate: boolean; projects: Set<string>
}

const mono = { fontFamily: 'monospace' as const }
function statusColor(s: string | null) {
  if (!s) return '#c5cbd3'
  if (s === '정상') return '#1c7c3c'
  if (s === '결근') return '#c60a2e'
  return '#c07a00'
}
const catColor: Record<string, string> = { 회의: '#2b6cb0', 출장: '#a5561b', 교육: '#1c7c3c', 기타: '#8a929c' }

export default function WorkIntegratedPage() {
  const [att, setAtt] = useState<AttendanceRow[]>([])
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 조건 <b>[적요]</b>. 근태에 적어 둔 메모(note)가 응답에 진작 실려 오는데
   * 화면이 버리고 있어서, "출장이라고 적어 둔 날" 만 골라 볼 수가 없었다.
   */
  const [noteCond, setNoteCond] = useState('')
  /*
   * 원본 조건 <b>[사원명]·[부서]·[상태]·[일정구분]</b>. 우리는 검색상자 하나로 이름과 부서를
   * 함께 훑고 있어서, "김"으로 치면 <b>김씨 사원과 김포지점이 같이</b> 걸렸다.
   * 나머지 조건(내/외근구분·근태항목·휴가항목·근태그룹·공유여부)은 우리 응답에 그 값이 없다.
   */
  const [nameCond, setNameCond] = useState('')
  const [deptCond, setDeptCond] = useState('')
  const [statusCond, setStatusCond] = useState('')
  const [catCond, setCatCond] = useState('')
  /** 원본 조건 [공유여부]·[프로젝트]. 서버가 이제 실어 준다. */
  const [sharedCond, setSharedCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  /**
   * 원본 출·퇴근기록부(ID)의 탭 — <b>[사용자]가 기본</b>이다. 내 기록만 보는 자리인데
   * 우리는 늘 전체를 뿌려서, 사람이 많은 회사에서는 내 줄을 눈으로 찾아야 했다.
   */
  const [tab, setTab] = useState<'사용자' | '전체'>('사용자')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      const [a, e] = await Promise.all([
        api.get<AttendanceRow[]>('/hr/attendance', { params }),
        api.get<ScheduleEvent[]>('/schedule-events'),
      ])
      setAtt(a.data); setEvents(e.data)
    } catch (err) { setError(extractErrorMessage(err)); setAtt([]); setEvents([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    const map = new Map<string, MergedRow>()
    for (const a of att) {
      map.set(`${a.empName}|${a.date}`, {
        key: `${a.empName}|${a.date}`, date: a.date, name: a.empName, department: a.department,
        clockIn: a.clockIn, clockOut: a.clockOut, status: a.status, note: a.note, events: [],
        hasShared: false, hasPrivate: false, projects: new Set<string>(),
      })
    }
    // 일정을 이름+일자로 붙인다. 기간 필터는 근태와 동일하게 적용.
    for (const ev of events) {
      if (from && ev.eventDate < from) continue
      if (to && ev.eventDate > to) continue
      const name = ev.owner ?? '(미지정)'
      const key = `${name}|${ev.eventDate}`
      let row = map.get(key)
      if (!row) {
        row = {
          key, date: ev.eventDate, name, department: null, clockIn: null, clockOut: null,
          status: null, note: null, events: [],
          hasShared: false, hasPrivate: false, projects: new Set<string>(),
        }
        map.set(key, row)
      }
      row.events.push({ title: ev.title, category: ev.category, startTime: ev.startTime })
      /* 일정의 공유·프로젝트는 <b>그 줄에</b> 모아 둔다 — 한 줄에 일정이 여럿일 수 있다. */
      if (ev.shared) row.hasShared = true
      else row.hasPrivate = true
      if (ev.projectName) row.projects.add(ev.projectName)
    }
    return [...map.values()]
      .filter((r) => !keyword || r.name.includes(keyword) || (r.department ?? '').includes(keyword))
      .filter((r) => !noteCond || (r.note ?? '').includes(noteCond))
      .filter((r) => !nameCond || r.name.includes(nameCond))
      .filter((r) => !deptCond || (r.department ?? '').includes(deptCond))
      .filter((r) => !statusCond || (r.status ?? '') === statusCond)
      /*
       * 원본 조건 <b>[공유여부]</b>. 한 줄에 일정이 여럿일 수 있어 <b>그 줄에 하나라도</b>
       * 있으면 걸리게 한다 — 공유 하나·비공개 하나면 어느 쪽으로 걸러도 나온다.
       */
      .filter((r) => !sharedCond || (sharedCond === '공유' ? r.hasShared : r.hasPrivate))
      /* 원본 조건 [프로젝트]. 일정에 붙은 현장·과제로 좁힌다. */
      .filter((r) => !projectCond || r.projects.has(projectCond))
      /* 일정구분은 그 줄의 <b>일정 가운데 하나라도</b> 맞으면 남긴다 — 하루에 여럿일 수 있다. */
      .filter((r) => !catCond || r.events.some((e) => (e.category ?? '') === catCond))
      // 원본 탭 [사용자] — 내 기록만 본다. 사람이 많은 회사에서 남의 줄 사이를 훑을 일이 아니다.
      .filter((r) => tab === '전체' || r.name === user?.name)
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'ko'))
  }, [att, events, from, to, keyword, noteCond, nameCond, deptCond, statusCond, catCond, sharedCond, projectCond, tab, user?.name])

  const eventTotal = useMemo(() => rows.reduce((s, r) => s + r.events.length, 0), [rows])

  /*
   * 원본 조건 <b>[정렬/소계기준]</b> — 소계를 무엇으로 묶을지 고른다(사본 실측).
   * 이 표는 사람×날짜로 잘게 펴 놓은 것이라, "이 부서가 그 주에 결근이 몇 건이었나" 를
   * 세려면 줄을 손으로 헤아려야 했다.
   */
  const SUBTOTALS = ['사원', '부서'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('사원')
  const subtotals = useMemo(
    () => subtotalBy(rows, (r) => (subtotal === '부서' ? r.department : r.name), {
      건수: () => 1,
      결근: (r) => (r.status === '결근' ? 1 : 0),
      지각조퇴: (r) => (r.status === '지각' || r.status === '조퇴' ? 1 : 0),
      일정: (r) => r.events.length,
    }),
    [rows, subtotal])
  /** 고를 값 — 받아 온 줄에서 모은다(마스터가 없다). */
  const statuses = [...new Set(att.map((a) => a.status).filter(Boolean))].sort()
  const categories = [...new Set(events.map((e) => e.category ?? '').filter(Boolean))].sort()
  /* 고를 값은 지금 받아 온 일정에서 모은다 — 안 쓰는 프로젝트를 늘어놓지 않는다. */
  const projects = [...new Set(events.map((e) => e.projectName ?? '').filter(Boolean))].sort()


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(rows, {
    일자: (r) => r.date,
  })

  return (
    <EcListShell title="출퇴근/근태/일정현황(ID)" search={keyword} onSearchChange={setKeyword} onSearch={load}
      onNew={undefined} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      {/* 원본 출·퇴근기록부(ID)의 탭 — [사용자]는 내 기록만, [전체]는 모두. */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {(['사용자', '전체'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기간</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn" onClick={load}>조회</button>
        {/*
          원본 조건 [사원명]·[부서]·[상태]·[일정구분].
          <b>고를 값은 지금 받아 온 줄에서 모은다</b> — 근태 상태와 일정 구분은 서버가 목록으로
          주는 마스터가 아니라서다. 그래서 기간을 바꾸면 고를 수 있는 값도 같이 달라진다.
        */}
        <span style={{ marginLeft: 8 }}>사원명</span>
        <input className="ec-input" value={nameCond}
               onChange={(e) => setNameCond(e.target.value)} style={{ width: 110 }} />
        <span style={{ marginLeft: 8 }}>부서</span>
        <input className="ec-input" value={deptCond}
               onChange={(e) => setDeptCond(e.target.value)} style={{ width: 110 }} />
        {/* 원본 차례: 사원명 · 부서 · <b>프로젝트</b> · 적요 (사본 실측). */}
        <span style={{ marginLeft: 8 }}>프로젝트</span>
        <select className="ec-input" value={projectCond} style={{ width: 130 }}
                onChange={(e) => setProjectCond(e.target.value)}>
          <option value="">전체</option>
          {projects.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {/* 원본 조건 [적요] — 근태 메모로 좁힌다. */}
        <span style={{ marginLeft: 8 }}>적요</span>
        <input className="ec-input" placeholder="적요 일부" value={noteCond}
               onChange={(e) => setNoteCond(e.target.value)} style={{ width: 150 }} />
        <span style={{ marginLeft: 8 }}>상태</span>
        <select className="ec-input" value={statusCond} style={{ width: 100 }}
                onChange={(e) => setStatusCond(e.target.value)}>
          <option value="">전체</option>
          {statuses.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <span style={{ marginLeft: 8 }}>일정구분</span>
        <select className="ec-input" value={catCond} style={{ width: 110 }}
                onChange={(e) => setCatCond(e.target.value)}>
          <option value="">전체</option>
          {categories.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {/* 원본 차례: 조건 판 <b>맨 끝</b>이다(사본 실측). */}
        {/* 원본 차례: 적요 · 상태 · 일정구분 · <b>공유여부</b> · 정렬/소계기준 (사본 실측). */}
        <span style={{ marginLeft: 8 }}>공유여부</span>
        <select className="ec-input" value={sharedCond} style={{ width: 100 }}
                onChange={(e) => setSharedCond(e.target.value)}>
          <option value="">전체</option>
          <option value="공유">공유</option>
          <option value="비공개">비공개</option>
        </select>
        <span style={{ marginLeft: 8 }}>정렬/소계기준</span>
        <div className="ec-pills">
          {SUBTOTALS.map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                    onClick={() => setSubtotal(v)}>{v}</button>
          ))}
        </div>
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>근태·일정을 사원명+일자로 통합</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>
          행 <b style={{ color: '#3c4553' }}>{rows.length}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          일정 <b style={{ color: '#2b6cb0', fontSize: 14 }}>{eventTotal}</b>건
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('일자')}>일자 {sort.mark('일자')}</th><th>사원/담당</th><th>부서</th>
            <th style={{ textAlign: 'center' }}>출근</th><th style={{ textAlign: 'center' }}>퇴근</th>
            <th style={{ textAlign: 'center' }}>근태</th>
            {/* 원본 조건에 [적요]가 있다 — 거르려면 표에도 보여야 한다. */}
            <th style={{ width: 140 }}>적요</th><th>일정</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={mono}>{dateText(r.date)}</td>
              <td>{r.name}</td>
              <td style={{ color: '#5a626e' }}>{r.department ?? ''}</td>
              <td style={{ ...mono, textAlign: 'center' }}>{r.clockIn ?? ''}</td>
              <td style={{ ...mono, textAlign: 'center' }}>{r.clockOut ?? ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(r.status) }}>{r.status ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{r.note ?? ''}</td>
              <td>
                {r.events.length === 0 ? <span style={{ color: '#c5cbd3' }}>-</span> : (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {r.events.map((ev, ei) => (
                      <span key={ei} style={{ fontSize: 11.5, padding: '1px 7px', borderRadius: 10, background: '#f1f4f8', color: catColor[ev.category ?? '기타'] ?? '#5a626e' }}>
                        {ev.category ? `[${ev.category}] ` : ''}{ev.startTime ? `${ev.startTime} ` : ''}{ev.title}
                      </span>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
          <table className="w-full text-left">
            <thead><tr>
              <th>{subtotal}</th>
              <th style={{ width: 80, textAlign: 'right' }}>건수</th>
              <th style={{ width: 70, textAlign: 'right' }}>결근</th>
              <th style={{ width: 90, textAlign: 'right' }}>지각·조퇴</th>
              <th style={{ width: 70, textAlign: 'right' }}>일정</th>
            </tr></thead>
            <tbody>
              {subtotals.map((g) => (
                <tr key={g.label}>
                  <td style={{ fontWeight: 600 }}>{g.label}</td>
                  <td style={{ textAlign: 'right' }}>{g.sums.건수}</td>
                  <td style={{ textAlign: 'right', color: g.sums.결근 ? '#c60a2e' : undefined }}>{g.sums.결근}</td>
                  <td style={{ textAlign: 'right', color: g.sums.지각조퇴 ? '#c07a00' : undefined }}>{g.sums.지각조퇴}</td>
                  <td style={{ textAlign: 'right', color: g.sums.일정 ? '#2b6cb0' : undefined }}>{g.sums.일정}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </EcListShell>
  )
}
